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

const BLE_WRITE_CHUNK_SIZE = 20;
const BLE_WRITE_CHUNK_DELAY_MS = 30;

type UniCallbackResult = {
  errCode?: number;
  errMsg?: string;
};

type UniBleDevice = {
  deviceId: string;
  name?: string;
  localName?: string;
};

type UniBleService = {
  uuid: string;
  isPrimary?: boolean;
};

type UniBleCharacteristic = {
  uuid: string;
  properties?: {
    write?: boolean;
    writeNoResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
};

type UniBleValueChangeEvent = {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: ArrayBuffer;
};

type PendingResponse = {
  resolve: (response: DeviceResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class BleUniClient implements YilaBleClient {
  private deviceId: string | null = null;
  private deviceName: string | null = null;
  private serviceId: string | null = null;
  private txCharacteristicId: string | null = null;
  private rxCharacteristicId: string | null = null;
  private txWriteType: "write" | "writeNoResponse" | undefined;
  private notificationReady = false;
  private valueHandler: ((event: UniBleValueChangeEvent) => void) | null = null;
  private pendingResponse: PendingResponse | null = null;

  get connected(): boolean {
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

    await callUni("openBluetoothAdapter", {}, "蓝牙适配器初始化失败，请确认蓝牙已开启。");

    const device = await this.scanForDevice(namePrefix);
    await stopDiscoveryQuietly();

    await withTimeout(
      callUni("createBLEConnection", {
        deviceId: device.deviceId,
        timeout: connectTimeoutMs,
      }),
      connectTimeoutMs,
      "蓝牙连接超时。",
    );

    await callUni("setBLEMTU", { deviceId: device.deviceId, mtu: 128 }).catch(() => {
      // setBLEMTU only works on some Android environments. A failed MTU request is harmless.
    });

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
    await delay(150);

    return {
      deviceName: this.deviceName,
      deviceId: this.deviceId,
    };
  }

  async disconnect(options: DisconnectOptions = {}): Promise<void> {
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

  private async scanForDevice(namePrefix: string): Promise<UniBleDevice> {
    return new Promise((resolve, reject) => {
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

    const txWriteType = tx.properties?.writeNoResponse
      ? "writeNoResponse"
      : tx.properties?.write
        ? "write"
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

  private async writeCommand(command: Uint8Array, timeoutMs: number): Promise<DeviceResponse> {
    if (!this.connected || !this.deviceId || !this.serviceId || !this.txCharacteristicId) {
      throw new Error("设备未连接。");
    }

    const responsePromise = this.waitForResponse(timeoutMs);
    try {
      for (let offset = 0; offset < command.byteLength; offset += BLE_WRITE_CHUNK_SIZE) {
        const chunk = command.slice(offset, offset + BLE_WRITE_CHUNK_SIZE);
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
        if (offset + BLE_WRITE_CHUNK_SIZE < command.byteLength) {
          await delay(BLE_WRITE_CHUNK_DELAY_MS);
        }
      }
    } catch (error) {
      this.clearPendingResponse({ success: false, message: toErrorMessage(error) });
      throw error;
    }

    return responsePromise;
  }

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

  private bindValueHandler(): void {
    this.unbindValueHandler();
    this.valueHandler = (event) => {
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

  private unbindValueHandler(): void {
    if (this.valueHandler) {
      offBLECharacteristicValueChange(this.valueHandler);
      this.valueHandler = null;
    }
  }

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

function normalizeFoundDevices(event: UniBleDevice | { devices?: UniBleDevice[] }): UniBleDevice[] {
  if ("devices" in event && Array.isArray(event.devices)) {
    return event.devices;
  }
  return [event as UniBleDevice];
}

function onBluetoothDeviceFound(handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void): void {
  const api = uni as unknown as {
    onBluetoothDeviceFound?: (handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void) => void;
  };
  api.onBluetoothDeviceFound?.(handler);
}

function offBluetoothDeviceFound(handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void): void {
  const api = uni as unknown as {
    offBluetoothDeviceFound?: (handler: (event: UniBleDevice | { devices?: UniBleDevice[] }) => void) => void;
  };
  api.offBluetoothDeviceFound?.(handler);
}

function onBLECharacteristicValueChange(handler: (event: UniBleValueChangeEvent) => void): void {
  const api = uni as unknown as {
    onBLECharacteristicValueChange?: (handler: (event: UniBleValueChangeEvent) => void) => void;
  };
  api.onBLECharacteristicValueChange?.(handler);
}

function offBLECharacteristicValueChange(handler: (event: UniBleValueChangeEvent) => void): void {
  const api = uni as unknown as {
    offBLECharacteristicValueChange?: (handler: (event: UniBleValueChangeEvent) => void) => void;
  };
  api.offBLECharacteristicValueChange?.(handler);
}

async function stopDiscoveryQuietly(): Promise<void> {
  await callUni("stopBluetoothDevicesDiscovery").catch(() => {
    // Discovery may already be stopped.
  });
}

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

function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function formatUniError(method: string, error: UniCallbackResult, fallbackMessage?: string): string {
  const detail = error.errMsg || (error.errCode === undefined ? "" : `errCode: ${error.errCode}`);
  if (!detail) {
    return fallbackMessage || `${method} failed.`;
  }
  return fallbackMessage ? `${fallbackMessage} (${detail})` : detail;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
