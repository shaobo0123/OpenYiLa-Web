import type { YilaBleClient } from "./types";
import { BleH5Client } from "./ble-h5";
import { BleUniClient } from "./ble-uni";

let instance: YilaBleClient | null = null;

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
