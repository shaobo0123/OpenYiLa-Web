import type { YilaBleClient } from "./types";
import { BleH5Client } from "./ble-h5";
import { BleUniClient } from "./ble-uni";

// 单例客户端：连接是独占的，整个 App 共用一个
let instance: YilaBleClient | null = null;

/**
 * 获取 BLE 客户端单例。
 * 编译期通过 uni-app 的条件编译注释按端选择实现：
 * H5 走 Web Bluetooth，其它端（小程序/App）走 uni 的 BLE API。
 */
export function getBleClient(): YilaBleClient {
  if (!instance) {
    // #ifdef H5
    instance = new BleH5Client();
    // #endif
    // #ifndef H5
    instance = new BleUniClient();
    // #endif
  }
  return instance;
}

export type { YilaBleClient, ConnectionInfo, ConnectOptions, DisconnectOptions } from "./types";
