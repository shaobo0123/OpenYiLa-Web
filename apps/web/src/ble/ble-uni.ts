import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_DEVICE_NAME_PREFIX,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  DEFAULT_SCAN_TIMEOUT_MS,
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

/** BLE ATT 默认 MTU 下的有效写入上限（MTU 23 − 3 ATT 头），仅用于 setBLEMTU 的判定下限 */
const BLE_WRITE_CHUNK_SIZE = 20;
/** Android 小程序端尽量协商更大的 MTU（仅部分系统支持，失败不影响整包写入） */
const BLE_REQUEST_MTU = 128;
/** 两次分片写入之间的间隔（毫秒），给设备留处理时间 */
const BLE_WRITE_CHUNK_DELAY_MS = 30;
/**
 * setBLEMTU 失败时的默认单次写入上限（对应常见协商 MTU 247 − 3 ATT 头）。
 *
 * 关键：YiLa 设备把每次 writeBLECharacteristicValue 当作一条独立命令解析，
 *       绝不能按 20 字节分片——必须一次性写入完整 64 字节命令，否则设备会把
 *       半包当完整命令处理并回 ERROR（0x45 0x52 0x52 0x4F 0x52）。
 *
 * 现代 Android/iOS 在建立 GATT 连接时系统通常会自动协商出 ≥185 的 ATT MTU
 * （H5 Web Bluetooth 在同一台手机能一次写 64 字节即为证），远大于 YiLa 命令长度。
 * setBLEMTU 只是「确认」而非「必需」，失败也按整包写即可。
 */
const BLE_DEFAULT_MAX_WRITE_BYTES = 244;

/** uni API 的回调返回结构 */
type UniCallbackResult = {
  errCode?: number;
  errMsg?: string;
};

type UniMtuResult = UniCallbackResult & {
  mtu?: number;
};

/** 扫描/发现到的设备 */
type UniBleDevice = {
  deviceId: string;
  name?: string;
  localName?: string;
};

/** 设备的 GATT 服务 */
type UniBleService = {
  uuid: string;
  isPrimary?: boolean;
};

/** 特征及其属性（可写方式 / 是否可通知） */
type UniBleCharacteristic = {
  uuid: string;
  properties?: {
    write?: boolean;
    writeNoResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
};

/** 特征值变化事件（设备 → App 的应答） */
type UniBleValueChangeEvent = {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: ArrayBuffer;
};

/** 一条命令的待处理应答：resolve 回调 + 超时定时器 */
type PendingResponse = {
  resolve: (response: DeviceResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
};

/**
 * 基于 uni-app BLE API 的客户端（微信小程序 / App 等非 H5 端）。
 *
 * 与 H5 不同：连接前要先打开蓝牙适配器并扫描设备（小程序没有
 * Web Bluetooth 那样的 requestDevice 选择器），连接后再发现服务/特征、
 * 开启通知。命令按 20 字节分片写入。
 */
export class BleUniClient implements YilaBleClient {
  private deviceId: string | null = null;
  private deviceName: string | null = null;
  private serviceId: string | null = null;
  private txCharacteristicId: string | null = null;
  private rxCharacteristicId: string | null = null;
  private txWriteType: "write" | "writeNoResponse" | undefined;
  private maxWriteBytes = BLE_DEFAULT_MAX_WRITE_BYTES;
  private notificationReady = false;
  private valueHandler: ((event: UniBleValueChangeEvent) => void) | null = null;
  private pendingResponse: PendingResponse | null = null;

  get connected(): boolean {
    // 设备/服务/特征/通知全部就绪才算已连接
    return Boolean(
      this.deviceId &&
        this.serviceId &&
        this.txCharacteristicId &&
        this.rxCharacteristicId &&
        this.notificationReady,
    );
  }

  get connectedDeviceId(): string | null {
    return this.connected ? this.deviceId : null;
  }

  async connect(options: ConnectOptions = {}): Promise<ConnectionInfo> {
    const namePrefix = options.namePrefix || DEFAULT_DEVICE_NAME_PREFIX;
    const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    // 1) 打开蓝牙适配器（要求系统蓝牙已开启）
    await callUni("openBluetoothAdapter", {}, "蓝牙适配器初始化失败，请确认蓝牙已开启。");

    // 2) 扫描并匹配到目标设备
    const device = await this.scanForDevice(namePrefix);
    await stopDiscoveryQuietly();

    // 3) 建立 GATT 连接
    await withTimeout(
      callUni("createBLEConnection", {
        deviceId: device.deviceId,
        timeout: connectTimeoutMs,
      }),
      connectTimeoutMs,
      "蓝牙连接超时。",
    );

    this.maxWriteBytes = BLE_DEFAULT_MAX_WRITE_BYTES;
    // 尝试确认系统已协商的 MTU（仅部分 Android 支持 setBLEMTU；失败不影响整包写入）
    await callUni<UniMtuResult>("setBLEMTU", { deviceId: device.deviceId, mtu: BLE_REQUEST_MTU })
      .then((result) => {
        const mtu = Number(result.mtu || BLE_REQUEST_MTU);
        if (Number.isFinite(mtu) && mtu > BLE_WRITE_CHUNK_SIZE + 3) {
          this.maxWriteBytes = Math.max(BLE_WRITE_CHUNK_SIZE, Math.floor(mtu) - 3);
        }
      })
      .catch(() => {
        // setBLEMTU 失败（iOS 不支持、或系统已自动协商大 MTU 时冲突报 internal error）
        // 不影响整包写入：保持 BLE_DEFAULT_MAX_WRITE_BYTES，依赖系统底层 ATT MTU 即可
      });

    // 4) 发现 NUS 服务与 TX/RX 特征
    const serviceId = await this.resolveServiceId(device.deviceId, connectTimeoutMs);
    const characteristics = await this.resolveCharacteristics(
      device.deviceId,
      serviceId,
      connectTimeoutMs,
    );

    this.deviceId = device.deviceId;
    this.deviceName = device.localName || device.name || namePrefix;
    this.serviceId = serviceId;
    this.txCharacteristicId = characteristics.txCharacteristicId;
    this.rxCharacteristicId = characteristics.rxCharacteristicId;
    this.txWriteType = characteristics.txWriteType;
    this.bindValueHandler();

    // 5) 开启 RX 通知（设备应答通过此通道上报）
    await withTimeout(
      callUni("notifyBLECharacteristicValueChange", {
        state: true,
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.rxCharacteristicId,
      }),
      connectTimeoutMs,
      "蓝牙通知通道开启超时。",
    );
    this.notificationReady = true;
    // 部分 Android 实现通知开启后需要短暂等待才稳定
    await delay(150);

    return {
      deviceName: this.deviceName,
      deviceId: this.deviceId,
    };
  }

  async disconnect(options: DisconnectOptions = {}): Promise<void> {
    // 先把尚未返回的命令应答以「已断开」结算
    this.clearPendingResponse({ success: false, message: "Disconnected" });

    if (this.deviceId && this.serviceId && this.rxCharacteristicId && this.notificationReady) {
      await callUni("notifyBLECharacteristicValueChange", {
        state: false,
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.rxCharacteristicId,
      }).catch(() => {
        // The device may already be disconnected.
      });
    }

    const delayMs = options.delayMs ?? 0;
    if (delayMs > 0) {
      await delay(delayMs);
    }

    if (this.deviceId) {
      await callUni("closeBLEConnection", { deviceId: this.deviceId }).catch(() => {
        // The platform may have already closed the connection.
      });
    }

    this.unbindValueHandler();
    this.deviceId = null;
    this.deviceName = null;
    this.serviceId = null;
    this.txCharacteristicId = null;
    this.rxCharacteristicId = null;
    this.txWriteType = undefined;
    this.maxWriteBytes = BLE_DEFAULT_MAX_WRITE_BYTES;
    this.notificationReady = false;
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

  /**
   * 扫描并匹配第一个名称以 namePrefix 开头的设备。
   * 命中或扫描超时都会停止扫描并 settle 一次。
   */
  private async scanForDevice(namePrefix: string): Promise<UniBleDevice> {
    return new Promise((resolve, reject) => {
      // settled 防止 onFound 与 timeout 重复结算
      let settled = false;

      const finish = (device?: UniBleDevice, error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        offBluetoothDeviceFound(onFound);
        void stopDiscoveryQuietly();

        if (device) {
          resolve(device);
        } else {
          reject(error || new Error("未发现匹配的 YiLa 设备。"));
        }
      };

      const onFound = (event: UniBleDevice | { devices?: UniBleDevice[] }) => {
        const devices = normalizeFoundDevices(event);
        // 设备名优先用 localName（广播名），其次用 name
        const matched = devices.find((device) => {
          const name = device.localName || device.name || "";
          return Boolean(device.deviceId && name.startsWith(namePrefix));
        });

        if (matched) {
          finish(matched);
        }
      };

      const timeout = setTimeout(() => {
        finish(undefined, new Error("扫描超时，未发现匹配的 YiLa 设备。"));
      }, DEFAULT_SCAN_TIMEOUT_MS);

      onBluetoothDeviceFound(onFound);
      callUni("startBluetoothDevicesDiscovery", {
        allowDuplicatesKey: false,
        interval: 0,
      }).catch((error: unknown) => {
        finish(undefined, error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /** 发现设备的服务，挑出 NUS 服务 UUID */
  private async resolveServiceId(deviceId: string, timeoutMs: number): Promise<string> {
    const response = await withTimeout(
      callUni<{ services?: UniBleService[] }>("getBLEDeviceServices", { deviceId }),
      timeoutMs,
      "蓝牙服务发现超时。",
    );
    const service = (response.services || []).find(
      (item) => normalizeUuid(item.uuid) === normalizeUuid(NUS_SERVICE_UUID),
    );
    if (!service) {
      throw new Error("不是支持的 YiLa 设备：未找到 NUS 服务。");
    }
    return service.uuid;
  }

  /** 发现服务下的特征，定位 NUS TX/RX，并探测可用的写入方式 */
  private async resolveCharacteristics(
    deviceId: string,
    serviceId: string,
    timeoutMs: number,
  ): Promise<{
    txCharacteristicId: string;
    rxCharacteristicId: string;
    txWriteType: "write" | "writeNoResponse" | undefined;
  }> {
    const response = await withTimeout(
      callUni<{ characteristics?: UniBleCharacteristic[] }>("getBLEDeviceCharacteristics", {
        deviceId,
        serviceId,
      }),
      timeoutMs,
      "蓝牙特征发现超时。",
    );
    const characteristics = response.characteristics || [];
    const tx = characteristics.find(
      (item) => normalizeUuid(item.uuid) === normalizeUuid(NUS_TX_CHAR_UUID),
    );
    const rx = characteristics.find(
      (item) => normalizeUuid(item.uuid) === normalizeUuid(NUS_RX_CHAR_UUID),
    );

    if (!tx || !rx) {
      throw new Error("不是支持的 YiLa 设备：未找到 NUS TX/RX 特征。");
    }

    // 写入方式：优先普通写（更稳），其次无响应写。
    const txWriteType = tx.properties?.write
      ? "write"
      : tx.properties?.writeNoResponse
        ? "writeNoResponse"
        : undefined;

    if (!txWriteType) {
      throw new Error("YiLa 设备 TX 特征不支持写入。");
    }
    if (!rx.properties?.notify && !rx.properties?.indicate) {
      throw new Error("YiLa 设备 RX 特征不支持通知。");
    }

    return {
      txCharacteristicId: tx.uuid,
      rxCharacteristicId: rx.uuid,
      txWriteType,
    };
  }

  /** 按 maxWriteBytes 分片写入命令，并等待应答（带超时） */
  private async writeCommand(command: Uint8Array, timeoutMs: number): Promise<DeviceResponse> {
    if (!this.connected || !this.deviceId || !this.serviceId || !this.txCharacteristicId) {
      throw new Error("设备未连接。");
    }

    const responsePromise = this.waitForResponse(timeoutMs);
    try {
      const chunkSize = Math.max(BLE_WRITE_CHUNK_SIZE, this.maxWriteBytes);
      for (let offset = 0; offset < command.byteLength; offset += chunkSize) {
        if (!this.pendingResponse) {
          break;
        }
        const chunk = command.slice(offset, offset + chunkSize);
        const writeOptions: Record<string, unknown> = {
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: this.txCharacteristicId,
          value: toExactArrayBuffer(chunk),
        };

        if (this.txWriteType) {
          writeOptions.writeType = this.txWriteType;
        }

        await callUni("writeBLECharacteristicValue", writeOptions);
        // 不是最后一片时，间隔一小段时间再写下一片
        if (offset + chunkSize < command.byteLength) {
          await delay(BLE_WRITE_CHUNK_DELAY_MS);
        }
      }
    } catch (error) {
      // 写失败要结算挂起的应答，否则会一直挂到超时
      this.clearPendingResponse({ success: false, message: toErrorMessage(error) });
      throw error;
    }

    const response = await responsePromise;
    return response;
  }

  /** 注册一条命令的应答等待：先取消旧的，再起一个带超时的 Promise */
  private waitForResponse(timeoutMs: number): Promise<DeviceResponse> {
    this.clearPendingResponse({ success: false, message: "Canceled" });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingResponse = null;
        resolve({ success: false, message: "Response timeout" });
      }, timeoutMs);

      this.pendingResponse = { resolve, timeout };
    });
  }

  /** 绑定特征值变化监听，过滤出当前连接 RX 通道的应答并结算 pending */
  private bindValueHandler(): void {
    this.unbindValueHandler();
    this.valueHandler = (event) => {
      // 仅处理当前连接、当前 RX 特征的通知，避免串扰
      if (
        !this.pendingResponse ||
        event.deviceId !== this.deviceId ||
        normalizeUuid(event.serviceId) !== normalizeUuid(this.serviceId || "") ||
        normalizeUuid(event.characteristicId) !== normalizeUuid(this.rxCharacteristicId || "")
      ) {
        return;
      }

      const pending = this.pendingResponse;
      this.pendingResponse = null;
      clearTimeout(pending.timeout);
      pending.resolve(parseDeviceResponse(new Uint8Array(event.value)));
    };
    onBLECharacteristicValueChange(this.valueHandler);
  }

  /** 解绑特征值变化监听 */
  private unbindValueHandler(): void {
    if (this.valueHandler) {
      offBLECharacteristicValueChange(this.valueHandler);
      this.valueHandler = null;
    }
  }

  /** 立即用指定应答结算当前挂起的命令（若存在），并清空 */
  private clearPendingResponse(response: DeviceResponse): void {
    if (!this.pendingResponse) {
      return;
    }
    const pending = this.pendingResponse;
    this.pendingResponse = null;
    clearTimeout(pending.timeout);
    pending.resolve(response);
  }
}

/**
 * 调用 uni 的 BLE API，包装成 Promise。
 * 不存在的 API 直接 reject；fail 时拼装可读错误信息。
 */
function callUni<T = UniCallbackResult>(
  method: string,
  options: Record<string, unknown> = {},
  fallbackMessage?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const api = uni as unknown as Record<string, (options: Record<string, unknown>) => void>;
    const fn = api[method];
    if (typeof fn !== "function") {
      reject(new Error(`${method} is not available on this platform.`));
      return;
    }

    fn({
      ...options,
      success: (result: T) => resolve(result),
      fail: (error: UniCallbackResult) => {
        reject(new Error(formatUniError(method, error, fallbackMessage)));
      },
    });
  });
}

/** 兼容两种扫描回调格式：单设备 / { devices: [...] } */
function normalizeFoundDevices(event: UniBleDevice | { devices?: UniBleDevice[] }): UniBleDevice[] {
  if ("devices" in event && Array.isArray(event.devices)) {
    return event.devices;
  }
  return [event as UniBleDevice];
}

/** 注册「蓝牙设备发现」监听 */
function onBluetoothDeviceFound(handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void): void {
  const api = uni as unknown as {
    onBluetoothDeviceFound?: (handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void) => void;
  };
  api.onBluetoothDeviceFound?.(handler);
}

/** 注销「蓝牙设备发现」监听 */
function offBluetoothDeviceFound(handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void): void {
  const api = uni as unknown as {
    offBluetoothDeviceFound?: (handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void) => void;
  };
  api.offBluetoothDeviceFound?.(handler);
}

/** 注册「特征值变化」监听（设备应答） */
function onBLECharacteristicValueChange(handler: (event: UniBleValueChangeEvent) => void): void {
  const api = uni as unknown as {
    onBLECharacteristicValueChange?: (handler: (event: UniBleValueChangeEvent) => void) => void;
  };
  api.onBLECharacteristicValueChange?.(handler);
}

/** 注销「特征值变化」监听 */
function offBLECharacteristicValueChange(handler: (event: UniBleValueChangeEvent) => void): void {
  const api = uni as unknown as {
    offBLECharacteristicValueChange?: (handler: (event: UniBleValueChangeEvent) => void) => void;
  };
  api.offBLECharacteristicValueChange?.(handler);
}

/** 停止扫描，失败静默忽略（可能本就没在扫描） */
async function stopDiscoveryQuietly(): Promise<void> {
  await callUni("stopBluetoothDevicesDiscovery").catch(() => {
    // Discovery may already be stopped.
  });
}

/** 给 Promise 套一层超时：超时则 reject 出指定错误信息 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** UUID 归一化：去掉短横线并转小写，便于跨平台比较 */
function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

/** 把 Uint8Array 拷贝成独立的 ArrayBuffer（uni 写入 API 要求精确长度） */
function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** setTimeout 的 Promise 化封装 */
function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

/** 拼装 uni API 的错误信息：优先 fallbackMessage + 平台 detail */
function formatUniError(method: string, error: UniCallbackResult, fallbackMessage?: string): string {
  const detail = error.errMsg || (error.errCode === undefined ? "" : `errCode: ${error.errCode}`);
  if (!detail) {
    return fallbackMessage || `${method} failed.`;
  }
  return fallbackMessage ? `${fallbackMessage} (${detail})` : detail;
}

/** 任意错误对象 → 字符串 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
