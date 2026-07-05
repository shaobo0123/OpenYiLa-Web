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
  const info = await client.connect({ deviceId: device.id, namePrefix });
  saveSearchPrefix(namePrefix);
  return upsertDevice({
    ...device,
    id: info.deviceId,
    name: info.deviceName,
    lastConnectedAt: Date.now(),
  });
}

/**
 * 「按需连接」：连上目标设备 → 执行任务 → 自动断开。
 *
 * 蓝牙门锁不需要常连，只在开锁 / 改密 / 添加等操作时短暂连接，操作完即断，
 * 释放 GATT 资源、避免占用设备。`task` 抛错也会保证断开。
 *
 * @returns task 的返回值
 */
export async function withDeviceConnection<T>(
  device: DeviceRecord,
  task: (device: DeviceRecord) => Promise<T>,
): Promise<T> {
  const client = getBleClient();
  const wasConnected = client.connected && client.connectedDeviceId === device.id;
  const target = await ensureConnectedToDevice(device);
  try {
    return await task(target);
  } finally {
    // 之前就已经连着这台设备（理论上不会发生，按需连接下都是新连）则保持原状；
    // 否则操作完就断开。
    if (!wasConnected) {
      await client.disconnect().catch(() => {
        // 设备可能已自行断开，忽略
      });
    }
  }
}

/** 把任意错误对象转换成可读字符串 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 弹出跨端确认框。 */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: "确认",
      content: message,
      confirmText: "确定",
      cancelText: "取消",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    });
  });
}
