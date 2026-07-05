import { getBleClient } from "./index";
import {
  readSearchPrefix,
  saveSearchPrefix,
  upsertDevice,
  type DeviceRecord,
} from "../state/devices";

export async function ensureConnectedToDevice(device: DeviceRecord): Promise<DeviceRecord> {
  const client = getBleClient();
  if (client.connected && client.connectedDeviceId === device.id) {
    return device;
  }
  if (client.connected) {
    await client.disconnect();
  }
  const namePrefix = device.name || readSearchPrefix();
  const info = await client.connect({ namePrefix });
  saveSearchPrefix(namePrefix);
  return upsertDevice({
    ...device,
    id: info.deviceId,
    name: info.deviceName,
    lastConnectedAt: Date.now(),
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function confirmDialog(message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(message));
}
