import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_DEVICE_NAME_PREFIX,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  NUS_RX_CHAR_UUID,
  NUS_SERVICE_UUID,
  NUS_TX_CHAR_UUID,
  buildChangePasswordCommand,
  buildOpenCommand,
  parseDeviceResponse,
} from "@openyila/core";
import type {
  ConnectionInfo,
  ConnectOptions,
  DisconnectOptions,
  YilaBleClient,
} from "./types";
import type { ChangePasswordOptions, DeviceResponse, UnlockOptions } from "@openyila/core";

/**
 * 基于 Web Bluetooth API 的 H5 端 BLE 客户端。
 *
 * 设备连接 = requestDevice → GATT connect → 发现 NUS 服务/特征 →
 * 开启 RX 通知。命令通过 TX 写入，应答通过 RX 通知接收。
 */
export class BleH5Client implements YilaBleClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;

  get connected(): boolean {
    // GATT 已连接 + TX/RX 特征都已就绪才算真正可用
    return Boolean(this.server?.connected && this.tx && this.rx);
  }

  get connectedDeviceId(): string | null {
    return this.connected ? this.device?.id || null : null;
  }

  async connect(options: ConnectOptions = {}): Promise<ConnectionInfo> {
    if (!navigator.bluetooth) {
      throw new Error("This browser does not support Web Bluetooth.");
    }

    // requestDevice 必须在用户手势的同步调用栈中触发（Web Bluetooth 的安全限制）
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: options.namePrefix || DEFAULT_DEVICE_NAME_PREFIX }],
      optionalServices: [NUS_SERVICE_UUID],
    });

    if (!this.device.gatt) {
      throw new Error("Bluetooth GATT is not available for this device.");
    }

    // 后续 GATT 连接 / 服务发现 / 特征发现 / 通知开启，每一步都加超时保护
    const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.server = await withTimeout(
      this.device.gatt.connect(),
      connectTimeoutMs,
      "Bluetooth connection timeout.",
    );
    const service = await withTimeout(
      this.server.getPrimaryService(NUS_SERVICE_UUID),
      connectTimeoutMs,
      "Bluetooth service discovery timeout.",
    );
    this.tx = await withTimeout(
      service.getCharacteristic(NUS_TX_CHAR_UUID),
      connectTimeoutMs,
      "Bluetooth TX characteristic discovery timeout.",
    );
    this.rx = await withTimeout(
      service.getCharacteristic(NUS_RX_CHAR_UUID),
      connectTimeoutMs,
      "Bluetooth RX characteristic discovery timeout.",
    );
    await withTimeout(
      this.rx.startNotifications(),
      connectTimeoutMs,
      "Bluetooth notification setup timeout.",
    );

    return {
      deviceName: this.device.name || DEFAULT_DEVICE_NAME_PREFIX,
      deviceId: this.device.id,
    };
  }

  async disconnect(options: DisconnectOptions = {}): Promise<void> {
    if (this.rx) {
      try {
        // stopNotifications 在某些浏览器上 GATT 已断开后会 reject，忽略即可
        const stoppableRx = this.rx as BluetoothRemoteGATTCharacteristic & {
          stopNotifications?: () => Promise<BluetoothRemoteGATTCharacteristic>;
        };
        await stoppableRx.stopNotifications?.();
      } catch {
        // Some browsers reject stopNotifications after the GATT server is already gone.
      }
    }
    const delayMs = options.delayMs ?? 0;
    if (delayMs > 0) {
      await delay(delayMs);
    }
    this.server?.disconnect();
    this.device = null;
    this.server = null;
    this.tx = null;
    this.rx = null;
  }

  async open(options: UnlockOptions, timeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS): Promise<DeviceResponse> {
    return this.writeCommand(buildOpenCommand(options), timeoutMs);
  }

  async changePassword(
    options: ChangePasswordOptions,
    timeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
  ): Promise<DeviceResponse> {
    return this.writeCommand(buildChangePasswordCommand(options), timeoutMs);
  }

  async discoverOnce(_namePrefixes: string[], _timeoutMs?: number): Promise<Set<string>> {
    // H5 端 Web Bluetooth 无法静默扫描（requestDevice 必须弹系统选择器且需用户手势），
    // 固定返回空集合——H5 下"是否在附近"由 connect/open 时的实际交互体现。
    return new Set();
  }

  /** 写入一条加密命令，并等待 RX 通知的应答（带超时） */
  private async writeCommand(command: Uint8Array, timeoutMs: number): Promise<DeviceResponse> {
    if (!this.tx || !this.rx) {
      throw new Error("Device is not connected.");
    }

    // 拷贝一份独立 ArrayBuffer：部分浏览器会校验 buffer 来源
    const payload = new ArrayBuffer(command.byteLength);
    new Uint8Array(payload).set(command);
    const responsePromise = waitForResponse(this.rx, timeoutMs);

    // 优先用无响应写（更快），不支持时退回普通写
    if (this.tx.writeValueWithoutResponse) {
      await this.tx.writeValueWithoutResponse(payload);
    } else {
      await this.tx.writeValue(payload);
    }

    return responsePromise;
  }
}

/**
 * 监听特征值变化，等待第一条设备应答。
 * 超时或收到空数据时返回失败的 DeviceResponse（不抛错，便于上层统一处理）。
 */
function waitForResponse(
  characteristic: BluetoothRemoteGATTCharacteristic,
  timeoutMs: number,
): Promise<DeviceResponse> {
  return new Promise((resolve) => {
    let timeout = 0;
    const onValueChanged = (event: Event) => {
      window.clearTimeout(timeout);
      characteristic.removeEventListener("characteristicvaluechanged", onValueChanged);
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const value = target.value;
      if (!value) {
        resolve({ success: false, message: "Empty response" });
        return;
      }
      resolve(parseDeviceResponse(new Uint8Array(value.buffer.slice(0))));
    };

    timeout = window.setTimeout(() => {
      characteristic.removeEventListener("characteristicvaluechanged", onValueChanged);
      resolve({ success: false, message: "Response timeout" });
    }, timeoutMs);

    characteristic.addEventListener("characteristicvaluechanged", onValueChanged);
  });
}

/** 给 Promise 套一层超时：超时则 reject 出指定错误信息 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** setTimeout 的 Promise 化封装 */
function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}
