import type { YilaBleClient } from "./types";
import { BleH5Client } from "./ble-h5";

let instance: YilaBleClient | null = null;

export function getBleClient(): YilaBleClient {
  if (!instance) {
    instance = new BleH5Client();
  }
  return instance;
}

export type { YilaBleClient, ConnectionInfo, ConnectOptions, DisconnectOptions } from "./types";
