import { DEFAULT_DEVICE_NAME_PREFIX } from "@openyila/core";

/**
 * 单台设备的开锁时序参数（毫秒级电机控制）。
 * 一次完整开锁 = 推开 → 保持 → 拉回。
 */
export type Settings = {
  /** 开锁时长（毫秒）：电机推到开锁位 */
  openTimeMs: number;
  /** 等待时长（毫秒）：保持开锁状态的时间 */
  waitTimeMs: number;
  /** 关锁时长（毫秒）：电机回收至关锁位 */
  closeTimeMs: number;
  /** 是否反向（电机方向取反，适配反向安装） */
  reverse: boolean;
};

/** 持久化的设备记录（存储在 uni本地存储中） */
export type DeviceRecord = {
  /** 平台相关设备标识：H5 是 Web Bluetooth id，小程序/App 是 deviceId */
  id: string;
  /** 用户可见的设备名 */
  name: string;
  /** 电量等级 1-5，未上报时缺省 */
  batteryLevel?: number;
  /** 开锁时序设置 */
  settings: Settings;
  /** 首次创建时间戳（毫秒） */
  createdAt: number;
  /** 最近一次更新时间戳（毫秒） */
  updatedAt: number;
  /** 最近一次连接成功的时间戳（毫秒） */
  lastConnectedAt?: number;
  /** 最近一次开锁成功的时间戳（毫秒） */
  lastOpenedAt?: number;
};

/** 默认开锁时序 */
export const DEFAULT_SETTINGS: Settings = {
  openTimeMs: 1500,
  waitTimeMs: 1000,
  closeTimeMs: 800,
  reverse: false,
};

/** 默认设备名（与广播名前缀一致） */
export const DEFAULT_DEVICE_NAME = DEFAULT_DEVICE_NAME_PREFIX;

/** 本地存储 key：已绑定设备列表 */
const DEVICES_KEY = "openyila.devices";
/** 本地存储 key：上次搜索用的设备名前缀 */
const SEARCH_PREFIX_KEY = "openyila.search.namePrefix";

/**
 * 读取所有已绑定设备。
 * 解析失败或格式不合法时返回空数组，绝不抛错。
 */
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

/** 持久化设备列表到本地存储 */
export function saveDevices(devices: DeviceRecord[]): void {
  uni.setStorageSync(DEVICES_KEY, JSON.stringify(devices));
}

/** 按 id 查找单台设备，找不到返回 null */
export function findDevice(deviceId: string): DeviceRecord | null {
  return readDevices().find((device) => device.id === deviceId) || null;
}

/**
 * 新增或更新设备。
 * 已存在同 id 的记录则合并字段（保留首次创建时间，更新 updatedAt）；
 * 不存在则追加。写入后返回最新记录。
 */
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

/** 仅更新某台设备的时序设置，返回更新后的记录（设备不存在返回 null） */
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

/** 删除指定 id 的设备记录 */
export function deleteDeviceRecord(deviceId: string): void {
  saveDevices(readDevices().filter((item) => item.id !== deviceId));
}

/** 读取上次保存的搜索前缀，缺省回退到默认设备名 */
export function readSearchPrefix(): string {
  return (uni.getStorageSync(SEARCH_PREFIX_KEY) as string | null) || DEFAULT_DEVICE_NAME;
}

/** 保存搜索前缀，作为下次默认值 */
export function saveSearchPrefix(namePrefix: string): void {
  uni.setStorageSync(SEARCH_PREFIX_KEY, namePrefix);
}

/**
 * 规范化时序设置：非法值回退到默认，时间值限制在 0-10000ms。
 * 用于持久化和读取时统一校验，避免脏数据进入运行时。
 */
export function normalizeSettings(settings: Partial<Settings>): Settings {
  return {
    openTimeMs: clampTime(settings.openTimeMs, DEFAULT_SETTINGS.openTimeMs),
    waitTimeMs: clampTime(settings.waitTimeMs, DEFAULT_SETTINGS.waitTimeMs),
    closeTimeMs: clampTime(settings.closeTimeMs, DEFAULT_SETTINGS.closeTimeMs),
    reverse: Boolean(settings.reverse),
  };
}

/** 把任意输入钳制到合法的毫秒整数（0-10000），非法时回退默认值 */
function clampTime(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(10000, Math.max(0, Math.round(numberValue)));
}

/** 把任意输入转成有效时间戳（毫秒），非法或非正时回退当前时间 */
function normalizeTimestamp(value: unknown): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

/** 把任意输入转成有效时间戳（毫秒），非法时返回 undefined（用于可选字段） */
function normalizeOptionalTimestamp(value: unknown): number | undefined {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

/** 校验电量等级（1-5 整数），非法返回 undefined */
function normalizeBatteryLevel(value: unknown): number | undefined {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : undefined;
}
