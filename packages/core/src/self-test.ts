import {
  bytesToHex,
  buildChangePasswordCommand,
  buildOpenCommand,
  md5Hex,
  parseAdvertisementBattery,
  parseDeviceResponse,
} from "./index.js";

/**
 * 核心包自测：用固定输入验证 MD5、命令拼装/加密、电量解析的输出与
 * 预期完全一致。npm test 会编译后运行本文件。
 */

/** 断言辅助：actual !== expected 即抛错 */
function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// MD5 标准向量：空串与 "123456"
assertEqual(md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e", "md5 empty");
assertEqual(md5Hex("123456"), "e10adc3949ba59abbe56e057f20f883e", "md5 password");

// 开锁命令：固定时间戳，校验整段密文
const command = buildOpenCommand({
  password: "123456",
  openTimeMs: 1500,
  waitTimeMs: 1000,
  closeTimeMs: 800,
  reverse: false,
  timestampSeconds: 1700000000,
});

assertEqual(
  bytesToHex(command),
  "1E0FC9FD88C18ED35E1E741C74BD58983E75D84A7B8B89EABA10DC1D6A31F4AD6C67D7F1B51F06F22AB68B66EE27D11826B6F82731D6ADB924420E830FD8DF80",
  "open command",
);

// 改密命令：固定时间戳，校验整段密文
const changePasswordCommand = buildChangePasswordCommand({
  oldPassword: "123456",
  newPassword: "654321",
  timestampSeconds: 1700000000,
});

assertEqual(
  bytesToHex(changePasswordCommand),
  "1E0FC9FD88C18ED35E1E741C74BD5898746AB59B6E7FCB8794A5E932EE04ECCCF61F127BA31F423A8336EF98847903B4F293473441417C62A65F8A1F4D648B73",
  "change password command",
);

// 电量解析：原始厂商数据 vs AD 结构块两种形态
assertEqual(String(parseAdvertisementBattery(Uint8Array.from([0x0e, 0xe9, 0x86, 0x5a, 0x04, 0xdc, 0x05]))), "5", "battery raw manufacturer data");
assertEqual(String(parseAdvertisementBattery(Uint8Array.from([0x03, 0xff, 0x00, 0x04]))), "4", "battery advertisement block");
assertEqual(parseDeviceResponse(Uint8Array.from([0x05])).success ? "true" : "false", "true", "single-byte battery response success");
assertEqual(String(parseDeviceResponse(Uint8Array.from([0x05])).batteryLevel), "5", "single-byte battery response level");

console.log("openyila core self-test passed");
