import { DEFAULT_DEVICE_NAME_PREFIX } from "@openyila/core";

export type Settings = {
  openTimeMs: number;
  waitTimeMs: number;
  closeTimeMs: number;
  reverse: boolean;
};

export type DeviceRecord = {
  id: string;
  name: string;
  batteryLevel?: number;
  settings: Settings;
  createdAt: number;
  updatedAt: number;
  lastConnectedAt?: number;
  lastOpenedAt?: number;
};

export const DEFAULT_SETTINGS: Settings = {
  openTimeMs: 1500,
  waitTimeMs: 1000,
  closeTimeMs: 800,
  reverse: false,
};

export const DEFAULT_DEVICE_NAME = DEFAULT_DEVICE_NAME_PREFIX;

const DEVICES_KEY = "openyila.devices";
const SEARCH_PREFIX_KEY = "openyila.search.namePrefix";

export function readDevices(): DeviceRecord[] {
  const raw = uni.getStorageSync(DEVICES_KEY) as string | null;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<DeviceRecord>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((device) => device.id && device.name)
      .map((device) => {
        const record: DeviceRecord = {
          id: String(device.id),
          name: String(device.name),
          settings: normalizeSettings(device.settings || {}),
          createdAt: normalizeTimestamp(device.createdAt),
          updatedAt: normalizeTimestamp(device.updatedAt),
        };
        const batteryLevel = normalizeBatteryLevel(device.batteryLevel);
        const lastConnectedAt = normalizeOptionalTimestamp(device.lastConnectedAt);
        const lastOpenedAt = normalizeOptionalTimestamp(device.lastOpenedAt);
        if (batteryLevel) {
          record.batteryLevel = batteryLevel;
        }
        if (lastConnectedAt) {
          record.lastConnectedAt = lastConnectedAt;
        }
        if (lastOpenedAt) {
          record.lastOpenedAt = lastOpenedAt;
        }
        return record;
      });
  } catch {
    return [];
  }
}

export function saveDevices(devices: DeviceRecord[]): void {
  uni.setStorageSync(DEVICES_KEY, JSON.stringify(devices));
}

export function findDevice(deviceId: string): DeviceRecord | null {
  return readDevices().find((device) => device.id === deviceId) || null;
}

export function upsertDevice(
  input: Partial<DeviceRecord> & Pick<DeviceRecord, "id" | "name">,
): DeviceRecord {
  const devices = readDevices();
  const now = Date.now();
  const index = devices.findIndex((device) => device.id === input.id);
  const existing = index >= 0 ? devices[index] : null;
  const device: DeviceRecord = {
    id: input.id,
    name: input.name,
    settings: normalizeSettings(input.settings || existing?.settings || DEFAULT_SETTINGS),
    createdAt: input.createdAt || existing?.createdAt || now,
    updatedAt: now,
  };
  const lastConnectedAt = input.lastConnectedAt || existing?.lastConnectedAt;
  const lastOpenedAt = input.lastOpenedAt || existing?.lastOpenedAt;
  const batteryLevel = normalizeBatteryLevel(input.batteryLevel) || existing?.batteryLevel;
  if (batteryLevel) {
    device.batteryLevel = batteryLevel;
  }
  if (lastConnectedAt) {
    device.lastConnectedAt = lastConnectedAt;
  }
  if (lastOpenedAt) {
    device.lastOpenedAt = lastOpenedAt;
  }

  if (index >= 0) {
    devices[index] = device;
  } else {
    devices.push(device);
  }
  saveDevices(devices);
  return device;
}

export function updateDeviceSettings(
  deviceId: string,
  settings: Settings,
): DeviceRecord | null {
  const device = findDevice(deviceId);
  if (!device) {
    return null;
  }
  return upsertDevice({ ...device, settings });
}

export function deleteDeviceRecord(deviceId: string): void {
  saveDevices(readDevices().filter((item) => item.id !== deviceId));
}

export function readSearchPrefix(): string {
  return (uni.getStorageSync(SEARCH_PREFIX_KEY) as string | null) || DEFAULT_DEVICE_NAME;
}

export function saveSearchPrefix(namePrefix: string): void {
  uni.setStorageSync(SEARCH_PREFIX_KEY, namePrefix);
}

export function normalizeSettings(settings: Partial<Settings>): Settings {
  return {
    openTimeMs: clampTime(settings.openTimeMs, DEFAULT_SETTINGS.openTimeMs),
    waitTimeMs: clampTime(settings.waitTimeMs, DEFAULT_SETTINGS.waitTimeMs),
    closeTimeMs: clampTime(settings.closeTimeMs, DEFAULT_SETTINGS.closeTimeMs),
    reverse: Boolean(settings.reverse),
  };
}

function clampTime(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(10000, Math.max(0, Math.round(numberValue)));
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function normalizeOptionalTimestamp(value: unknown): number | undefined {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

function normalizeBatteryLevel(value: unknown): number | undefined {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : undefined;
}
