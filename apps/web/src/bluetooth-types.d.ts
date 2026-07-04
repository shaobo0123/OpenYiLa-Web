interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  addEventListener(
    type: "characteristicvaluechanged",
    listener: (event: Event) => void,
  ): void;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

type BluetoothServiceUUID = string | number;

type RequestDeviceOptions = {
  filters?: Array<{ name?: string; namePrefix?: string; services?: BluetoothServiceUUID[] }>;
  optionalServices?: BluetoothServiceUUID[];
};

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
