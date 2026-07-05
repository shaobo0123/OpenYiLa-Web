import type { UnlockOptions, ChangePasswordOptions, DeviceResponse } from "@yila/core";

/**
 * 三端统一的 BLE 客户端接口。
 * H5 / 微信小程序 / App 各自实现，由 ble/index.ts 在编译期按端选择。
 */
export interface YilaBleClient {
  /** 当前是否处于已连接状态（GATT + 通知通道都就绪） */
  readonly connected: boolean;
  /** 当前连接的设备 id（未连接返回 null） */
  readonly connectedDeviceId: string | null;

  /**
   * 发起设备选择 + 连接。必须在用户手势的同步调用栈里触发
   * （H5 端 Web Bluetooth 的 requestDevice 对 user activation 敏感）。
   */
  connect(options: ConnectOptions): Promise<ConnectionInfo>;

  /** 开锁 */
  open(options: UnlockOptions, timeoutMs?: number): Promise<DeviceResponse>;

  /** 改密码 */
  changePassword(
    options: ChangePasswordOptions,
    timeoutMs?: number,
  ): Promise<DeviceResponse>;

  /** 断开连接，释放资源 */
  disconnect(options?: DisconnectOptions): Promise<void>;
}

export type ConnectOptions = {
  /** 设备名前缀过滤（默认走 DEFAULT_DEVICE_NAME_PREFIX） */
  namePrefix?: string;
  /** 连接超时（毫秒） */
  connectTimeoutMs?: number;
};

export type DisconnectOptions = {
  /** 断开前的延迟（毫秒），给设备留响应时间 */
  delayMs?: number;
};

export type ConnectionInfo = {
  deviceName: string;
  /** 平台相关设备标识：H5 是 Web Bluetooth id，小程序是 deviceId，App 是 deviceId */
  deviceId: string;
};
