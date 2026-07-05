/**
 * OpenYiLa 与蓝牙门锁的通信协议核心。
 *
 * 设备使用 Nordic UART Service (NUS) 作为透传通道，命令体经
 * AES-128-ECB 加密后下发。这里包含协议常量、命令拼装与加密、
 * 设备应答解析，以及 MD5 / AES-128 的纯 TS 实现（避免运行时
 * 依赖 Node 或平台的 crypto）。
 */

/** Nordic UART Service 主服务 UUID（NUS Service） */
export const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
/** NUS TX 特征 UUID：App → 设备 的写入通道 */
export const NUS_TX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
/** NUS RX 特征 UUID：设备 → App 的通知通道 */
export const NUS_RX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
/** Client Characteristic Configuration Descriptor，用于开启 Notify/Indicate */
export const CCCD_UUID = "00002902-0000-1000-8000-00805f9b34fb";
/** 设备蓝牙广播名默认前缀，用于扫描过滤 */
export const DEFAULT_DEVICE_NAME_PREFIX = "YILA";
/** 蓝牙扫描超时（毫秒） */
export const DEFAULT_SCAN_TIMEOUT_MS = 6000;
/** 蓝牙连接（含服务/特征发现）超时（毫秒） */
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
/** 等待单条命令应答的超时（毫秒） */
export const DEFAULT_RESPONSE_TIMEOUT_MS = 6000;
/** 断开前等待设备响应的延迟（毫秒） */
export const DEFAULT_DISCONNECT_DELAY_MS = 500;

/** 外层 AES-128 加密密钥（16 字节），设备固件侧约定 */
const OUTER_AES_KEY = new TextEncoder().encode("Fx4k6AWivOsLE4NI");

/** 开锁命令参数 */
export type UnlockOptions = {
  /** 6 位数字密码（设备校验用） */
  password: string;
  /** 开锁时长（毫秒）：电机推动到开锁位的持续时间 */
  openTimeMs: number;
  /** 开门后等待时长（毫秒）：保持开锁状态的时间 */
  waitTimeMs: number;
  /** 关锁时长（毫秒）：电机回收至关锁位的持续时间 */
  closeTimeMs: number;
  /** 是否反向（电机方向取反，适配反向安装） */
  reverse: boolean;
  /** 可选：固定时间戳（秒），用于自测/复现命令 */
  timestampSeconds?: number;
};

/** 修改密码命令参数 */
export type ChangePasswordOptions = {
  /** 当前密码（6 位数字） */
  oldPassword: string;
  /** 新密码（6 位数字） */
  newPassword: string;
  /** 可选：固定时间戳（秒），用于自测/复现命令 */
  timestampSeconds?: number;
};

/** 设备应答的统一解析结果 */
export type DeviceResponse = {
  /** 命令是否执行成功 */
  success: boolean;
  /** 设备电量等级（1-5），未上报时缺省 */
  batteryLevel?: number;
  /** 给用户看的描述文本 */
  message: string;
};

/**
 * 拼装并加密「开锁」命令。
 *
 * 明文格式：`<时间戳><MD5(密码)[8:24]><payload>`，
 * payload 形如 `A:OPEN;P:[+|-] openTime,waitTime,closeTime;`，
 * 整体用 AES-128-ECB（零填充）加密后返回字节序列。
 */
export function buildOpenCommand(options: UnlockOptions): Uint8Array {
  if (!/^\d{6}$/.test(options.password)) {
    throw new Error("Password must be exactly 6 digits.");
  }

  const timestamp = options.timestampSeconds ?? Math.floor(Date.now() / 1000);
  // 取密码 MD5 的中间 16 位作为命令里的密钥字段
  const passwordKey = md5Hex(options.password).slice(8, 24);
  const direction = options.reverse ? "-" : "+";
  const payload = `A:OPEN;P:${direction} ${options.openTimeMs},${options.waitTimeMs},${options.closeTimeMs};`;
  const plaintext = `${timestamp}${passwordKey}${payload}`;
  return aes128EcbEncryptZeroPadded(utf8Bytes(plaintext), OUTER_AES_KEY);
}

/**
 * 拼装并加密「修改密码」命令。
 *
 * 明文格式：`<时间戳><MD5(旧密码)[8:24]><payload>`，
 * payload 形如 `A:PW;P:<MD5(新密码)[8:24]>;`。
 */
export function buildChangePasswordCommand(options: ChangePasswordOptions): Uint8Array {
  if (!/^\d{6}$/.test(options.oldPassword)) {
    throw new Error("Old password must be exactly 6 digits.");
  }
  if (!/^\d{6}$/.test(options.newPassword)) {
    throw new Error("New password must be exactly 6 digits.");
  }

  const timestamp = options.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const oldPasswordKey = md5Hex(options.oldPassword).slice(8, 24);
  const newPasswordKey = md5Hex(options.newPassword).slice(8, 24);
  const payload = `A:PW;P:${newPasswordKey};`;
  const plaintext = `${timestamp}${oldPasswordKey}${payload}`;
  return aes128EcbEncryptZeroPadded(utf8Bytes(plaintext), OUTER_AES_KEY);
}

/** 首次设置设备密码（与修改密码等价，仅为语义清晰保留别名） */
export function buildInitPasswordCommand(options: ChangePasswordOptions): Uint8Array {
  return buildChangePasswordCommand(options);
}

/**
 * 解析设备的应答字节。
 *
 * 兼容多种返回形态：
 * - 单字节（1-5）：直接当作电量等级；
 * - 文本（OK / ERROR / FAIL）；
 * - 二进制（"OK"/"ERROR" 的 ASCII 字节）。
 * 同时尽量从文本/广告数据中提取电量等级（1-5）。
 */
export function parseDeviceResponse(data: Uint8Array): DeviceResponse {
  if (data.length === 0) {
    return { success: false, message: "Empty response" };
  }

  let batteryLevel: number | undefined;
  // 单字节应答直接视为电量等级（设备上电上报场景）
  if (data.length === 1 && data[0]! >= 1 && data[0]! <= 5) {
    batteryLevel = data[0]!;
  }

  // 仅保留可见 ASCII + 制表/换行/回车，过滤掉控制字符
  const text = Array.from(data)
    .filter((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126))
    .map((byte) => String.fromCharCode(byte))
    .join("");
  const upper = text.toUpperCase();

  if (batteryLevel === undefined) {
    // 从文本里抓取 "BAT/BATTERY/PWR... + 数字" 形式的电量
    const match = upper.match(/(?:BAT|BATT|BATTERY|PWR|POWER)\D*([1-5])/);
    if (match?.[1]) {
      batteryLevel = Number(match[1]);
    }
  }

  if (upper.includes("OK")) {
    return deviceResponse(true, "OK", batteryLevel);
  }
  if (upper.includes("ERROR")) {
    return deviceResponse(false, "Password error", batteryLevel);
  }
  if (upper.includes("FAIL")) {
    return deviceResponse(false, "FAIL", batteryLevel);
  }

  // 文本匹配失败时退化为按十六进制匹配 ASCII 字节（4F4B = "OK"，4552524F52 = "ERROR"）
  const hex = bytesToHex(data);
  if (hex.includes("4F4B")) {
    return deviceResponse(true, "OK", batteryLevel);
  }
  if (hex.includes("4552524F52")) {
    return deviceResponse(false, "ERROR", batteryLevel);
  }

  return deviceResponse(false, "Unknown response", batteryLevel);
}

/**
 * 从蓝牙广播的厂商数据中解析电量等级。
 *
 * 先按 AD 结构块（length + type + data）解析；解析不到时退化为
 * 「最后一字节在 1-5 区间则当作电量」。
 */
export function parseAdvertisementBattery(manufacturerData: Uint8Array): number | undefined {
  if (manufacturerData.length === 0) {
    return undefined;
  }

  const blockBattery = parseBatteryFromAdvertisementBlocks(manufacturerData);
  if (blockBattery !== undefined) {
    return blockBattery;
  }

  const lastByte = manufacturerData[manufacturerData.length - 1]!;
  return isBatteryLevel(lastByte) ? lastByte : undefined;
}

/** 按 BLE AD 结构（length + type + data）逐块扫描，命中 1-5 即视为电量 */
function parseBatteryFromAdvertisementBlocks(manufacturerData: Uint8Array): number | undefined {
  let index = 0;
  while (index < manufacturerData.length - 2) {
    const length = manufacturerData[index]!;
    if (length === 0) {
      break;
    }

    const dataStart = index + 2;
    const dataEnd = dataStart + length - 1;
    if (dataEnd <= manufacturerData.length && length > 1) {
      const lastByte = manufacturerData[dataEnd - 1]!;
      if (isBatteryLevel(lastByte)) {
        return lastByte;
      }
    }
    index += length + 1;
  }

  return undefined;
}

/** 判断某字节是否落在合法电量区间 1-5 */
function isBatteryLevel(value: number): boolean {
  return value >= 1 && value <= 5;
}

/** 组装 DeviceResponse：仅在电量已知时附带 batteryLevel 字段 */
function deviceResponse(success: boolean, message: string, batteryLevel?: number): DeviceResponse {
  return batteryLevel === undefined ? { success, message } : { success, message, batteryLevel };
}

/** 字节数组转大写十六进制字符串 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * 计算字符串的 MD5 摘要（纯 TS 实现，无平台依赖）。
 * 仅用于把密码映射成命令中的密钥字段，不用于安全哈希存储。
 */
export function md5Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLength = bytes.length * 8;
  // MD5 标准填充：补 0x80 + 0x00 到 64 字节对齐，末尾 8 字节存原始位长度
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  // MD5 初始化向量（魔数）
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // 每轮的左移位数表
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  // 每步常量表 K[i] = floor(abs(sin(i+1)) * 2^32)
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  );

  // 按 64 字节分组处理
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = new Array<number>(16);
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    // 主循环：64 步，分四轮，每轮采用不同的非线性函数和字索引
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        // Round 1: F
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        // Round 2: G
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        // Round 3: H
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        // Round 4: I
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = (b + rotateLeft((a + f + constants[i]! + words[g]!) >>> 0, shifts[i]!)) >>> 0;
      a = next;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  // 拼装 16 字节摘要为小端 32 位字
  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 32 位循环左移 */
function rotateLeft(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

/** 字符串 → UTF-8 字节 */
function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** AES S-Box 置换表 */
const SBOX = Uint8Array.from([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

/** AES 密钥扩展用的轮常数（Rcon） */
const RCON = Uint8Array.from([0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

/**
 * AES-128-ECB 加密（零填充）。
 * 命令明文按 16 字节分块独立加密（ECB），不足部分补 0。
 */
function aes128EcbEncryptZeroPadded(data: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== 16) {
    throw new Error("AES-128 key must be 16 bytes.");
  }

  const paddedLength = Math.ceil(data.length / 16) * 16 || 16;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  const expandedKey = expandAes128Key(key);
  const output = new Uint8Array(paddedLength);

  for (let offset = 0; offset < paddedLength; offset += 16) {
    output.set(encryptAesBlock(padded.slice(offset, offset + 16), expandedKey), offset);
  }

  return output;
}

/** AES-128 密钥扩展：16 字节主密钥 → 176 字节轮密钥（11 轮） */
function expandAes128Key(key: Uint8Array): Uint8Array {
  const expanded = new Uint8Array(176);
  expanded.set(key);
  const temp = new Uint8Array(4);
  let bytesGenerated = 16;
  let rconIndex = 1;

  while (bytesGenerated < 176) {
    temp.set(expanded.slice(bytesGenerated - 4, bytesGenerated));
    if (bytesGenerated % 16 === 0) {
      // 每 16 字节边界做 RotWord + SubWord + Rcon，对应 AES 密钥扩展的「核心」步骤
      const first = temp[0]!;
      temp[0] = SBOX[temp[1]!]! ^ RCON[rconIndex++]!;
      temp[1] = SBOX[temp[2]!]!;
      temp[2] = SBOX[temp[3]!]!;
      temp[3] = SBOX[first]!;
    }

    for (let i = 0; i < 4; i += 1) {
      expanded[bytesGenerated] = expanded[bytesGenerated - 16]! ^ temp[i]!;
      bytesGenerated += 1;
    }
  }

  return expanded;
}

/** 加密单个 16 字节 AES 块：1 轮 AddRoundKey + 9 轮完整轮 + 1 轮末轮（省去 MixColumns） */
function encryptAesBlock(block: Uint8Array, expandedKey: Uint8Array): Uint8Array {
  const state = Uint8Array.from(block);
  addRoundKey(state, expandedKey, 0);

  for (let round = 1; round <= 9; round += 1) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, expandedKey, round * 16);
  }

  // 最后一轮不调用 MixColumns
  subBytes(state);
  shiftRows(state);
  addRoundKey(state, expandedKey, 160);
  return state;
}

/** AddRoundKey：状态与对应轮密钥异或 */
function addRoundKey(state: Uint8Array, expandedKey: Uint8Array, offset: number): void {
  for (let i = 0; i < 16; i += 1) {
    state[i] = state[i]! ^ expandedKey[offset + i]!;
  }
}

/** SubBytes：逐字节经 S-Box 置换 */
function subBytes(state: Uint8Array): void {
  for (let i = 0; i < 16; i += 1) {
    state[i] = SBOX[state[i]!]!;
  }
}

/** ShiftRows：行字节循环左移（行号 = 左移位数） */
function shiftRows(state: Uint8Array): void {
  const copy = Uint8Array.from(state);
  state[1] = copy[5]!;
  state[5] = copy[9]!;
  state[9] = copy[13]!;
  state[13] = copy[1]!;

  state[2] = copy[10]!;
  state[6] = copy[14]!;
  state[10] = copy[2]!;
  state[14] = copy[6]!;

  state[3] = copy[15]!;
  state[7] = copy[3]!;
  state[11] = copy[7]!;
  state[15] = copy[11]!;
}

/** MixColumns：在 GF(2^8) 上对每列做固定矩阵乘法 */
function mixColumns(state: Uint8Array): void {
  for (let col = 0; col < 4; col += 1) {
    const offset = col * 4;
    const a0 = state[offset]!;
    const a1 = state[offset + 1]!;
    const a2 = state[offset + 2]!;
    const a3 = state[offset + 3]!;
    state[offset] = multiply2(a0) ^ multiply3(a1) ^ a2 ^ a3;
    state[offset + 1] = a0 ^ multiply2(a1) ^ multiply3(a2) ^ a3;
    state[offset + 2] = a0 ^ a1 ^ multiply2(a2) ^ multiply3(a3);
    state[offset + 3] = multiply3(a0) ^ a1 ^ a2 ^ multiply2(a3);
  }
}

/** GF(2^8) 上乘 2（即 xtime），溢出项折算回 0x1b */
function multiply2(value: number): number {
  return ((value << 1) ^ ((value & 0x80) ? 0x1b : 0)) & 0xff;
}

/** GF(2^8) 上乘 3 = 乘 2 后再异或自身 */
function multiply3(value: number): number {
  return multiply2(value) ^ value;
}
