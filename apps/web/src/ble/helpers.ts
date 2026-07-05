import { getBleClient } from "./index";
import {
  readSearchPrefix,
  saveSearchPrefix,
  upsertDevice,
  type DeviceRecord,
} from "../state/devices";

/**
 * 确保当前 BLE 客户端连接到指定设备。
 *
 * - 若已连接到该设备，直接返回；
 * - 若连接的是别的设备，先断开；
 * - 搜索前缀优先用设备名，缺省回退到本地存储里上一次的前缀。
 *
 * 连接成功后会更新设备记录（同步 deviceId/name 和最近连接时间）。
 */
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

/** 把任意错误对象转换成可读字符串 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 弹出原生确认框（H5 用 window.confirm，小程序端走 uni 同名 API 的等价逻辑） */
export function confirmDialog(message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(message));
}
