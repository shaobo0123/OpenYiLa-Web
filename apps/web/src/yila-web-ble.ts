import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_DEVICE_NAME_PREFIX,
  DEFAULT_DISCONNECT_DELAY_MS,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  NUS_RX_CHAR_UUID,
  NUS_SERVICE_UUID,
  NUS_TX_CHAR_UUID,
  buildChangePasswordCommand,
  buildOpenCommand,
  parseDeviceResponse,
  type ChangePasswordOptions,
  type DeviceResponse,
  type UnlockOptions,
} from "@yila/core";

export type ConnectionInfo = {
  deviceName: string;
  deviceId: string;
};

export type DeviceRequestOptions = {
  namePrefix?: string;
  connectTimeoutMs?: number;
};

export type DisconnectOptions = {
  delayMs?: number;
};

export class YilaWebBleClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;

  get connected(): boolean {
    return Boolean(this.server?.connected && this.tx && this.rx);
  }

  get connectedDeviceId(): string | null {
    return this.connected ? this.device?.id || null : null;
  }

  async connect(options: DeviceRequestOptions = {}): Promise<ConnectionInfo> {
    if (!navigator.bluetooth) {
      throw new Error("This browser does not support Web Bluetooth.");
    }

    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: options.namePrefix || DEFAULT_DEVICE_NAME_PREFIX }],
      optionalServices: [NUS_SERVICE_UUID],
    });

    if (!this.device.gatt) {
      throw new Error("Bluetooth GATT is not available for this device.");
    }

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

  private async writeCommand(command: Uint8Array, timeoutMs: number): Promise<DeviceResponse> {
    if (!this.tx || !this.rx) {
      throw new Error("Device is not connected.");
    }

    const payload = new ArrayBuffer(command.byteLength);
    new Uint8Array(payload).set(command);
    const responsePromise = waitForResponse(this.rx, timeoutMs);

    if (this.tx.writeValueWithoutResponse) {
      await this.tx.writeValueWithoutResponse(payload);
    } else {
      await this.tx.writeValue(payload);
    }

    return responsePromise;
  }
}

export async function openAndDisconnect(
  client: YilaWebBleClient,
  options: UnlockOptions,
  responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
  disconnectDelayMs = DEFAULT_DISCONNECT_DELAY_MS,
): Promise<DeviceResponse> {
  try {
    return await client.open(options, responseTimeoutMs);
  } finally {
    await client.disconnect({ delayMs: disconnectDelayMs });
  }
}

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

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}
