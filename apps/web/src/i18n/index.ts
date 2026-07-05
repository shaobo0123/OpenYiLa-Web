import { createI18n } from "vue-i18n";

/** 支持的语言代码 */
export type Locale = "zh-CN" | "en-US";

/** 可选语言列表（用于设置页渲染按钮） */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
];

/** 本地存储 key：当前语言 */
const LOCALE_STORAGE_KEY = "openyila.locale";

const messages = {
  "zh-CN": {
    app: {
      title: "OpenYiLa 开门",
      badgeReady: "蓝牙可用",
      badgeUnsupported: "不支持",
    },
    device: {
      empty: "还没有设备",
      emptyHint: "点击右上角添加你的第一把 YiLa 锁",
      addTitle: "添加设备",
      addHint: "搜索并添加 YiLa 蓝牙设备",
      addedDone: "设备已添加",
      deleteConfirm: "确定删除 {name} 吗？",
      deleted: "{name} 已删除",
      batteryUnknown: "电量未知",
      filter: "搜索名称前缀",
    },
    action: {
      addDevice: "添加设备",
      searchDevice: "搜索添加",
      open: "一键开锁",
      delete: "删除",
      changePassword: "修改密码",
      confirmChangePassword: "确认修改",
      reset: "恢复默认",
      save: "保存",
    },
    field: {
      password: "设备密码",
      oldPassword: "当前密码",
      newPassword: "新密码",
      confirmPassword: "确认新密码",
      openTime: "开锁时间 (ms)",
      waitTime: "等待时间 (ms)",
      closeTime: "关锁时间 (ms)",
      reverse: "反向开锁",
    },
    status: {
      searching: "正在搜索设备...",
      opening: "正在开门...",
      changingPassword: "正在修改密码...",
      passwordInvalid: "密码必须是 6 位数字",
      passwordMismatch: "两次输入的新密码不一致",
      passwordChangeSuccess: "密码修改成功",
      passwordChangeFailed: "密码修改失败：{message}",
      unlockSuccess: "开门成功",
      unlockFailed: "开门失败：{message}",
      battery: "电量 {level}/5",
    },
    locale: {
      label: "语言",
    },
    settings: {
      title: "全局设置",
      languageHint: "选择界面显示语言",
    },
    admin: {
      noDevice: "未选择设备",
      currentSettings: "当前设置",
      savedFor: "{name} 的设置已保存",
      resetDoneFor: "{name} 已恢复默认设置",
      passwordTitle: "修改密码",
      openPasswordTitle: "开锁密码",
      openPasswordHint: "一键开锁时下发的密码，默认 123456，需与设备内密码一致。",
      reverseOn: "反向",
      reverseOff: "正常",
      timingTitle: "开锁时序",
    },
  },

  "en-US": {
    app: {
      title: "OpenYiLa Unlock",
      badgeReady: "Bluetooth Ready",
      badgeUnsupported: "Unsupported",
    },
    device: {
      empty: "No device yet",
      emptyHint: "Tap the top-right button to add your first YiLa lock.",
      addTitle: "Add Device",
      addHint: "Search and add a YiLa Bluetooth device",
      addedDone: "Device added",
      deleteConfirm: "Delete {name}?",
      deleted: "{name} deleted",
      batteryUnknown: "Battery unknown",
      filter: "Search name prefix",
    },
    action: {
      addDevice: "Add Device",
      searchDevice: "Search",
      open: "Unlock",
      delete: "Delete",
      changePassword: "Change Password",
      confirmChangePassword: "Confirm Change",
      reset: "Reset",
      save: "Save",
    },
    field: {
      password: "Password",
      oldPassword: "Current password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      openTime: "Open time (ms)",
      waitTime: "Wait time (ms)",
      closeTime: "Close time (ms)",
      reverse: "Reverse direction",
    },
    status: {
      searching: "Searching for device...",
      opening: "Unlocking...",
      changingPassword: "Changing password...",
      passwordInvalid: "Password must be 6 digits",
      passwordMismatch: "New passwords do not match",
      passwordChangeSuccess: "Password changed",
      passwordChangeFailed: "Password change failed: {message}",
      unlockSuccess: "Unlock success",
      unlockFailed: "Unlock failed: {message}",
      battery: "Battery {level}/5",
    },
    locale: {
      label: "Language",
    },
    settings: {
      title: "Settings",
      languageHint: "Choose display language",
    },
    admin: {
      noDevice: "No device selected",
      currentSettings: "Current settings",
      savedFor: "Settings saved for {name}",
      resetDoneFor: "Defaults restored for {name}",
      passwordTitle: "Change password",
      openPasswordTitle: "Unlock Password",
      openPasswordHint: "Password sent on one-tap unlock. Defaults to 123456; must match the device.",
      reverseOn: "Reverse",
      reverseOff: "Normal",
      timingTitle: "Unlock timing",
    },
  },
};

/** 类型守卫：判断任意值是否为受支持的 Locale */
function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.value === value);
}

/**
 * 探测初始语言：
 * 1) 优先读本地存储里用户上次的选择；
 * 2) 否则按系统语言判断（中文 → zh-CN，其余 → en-US）。
 */
function detectLocale(): Locale {
  const stored = uni.getStorageSync(LOCALE_STORAGE_KEY);
  if (isLocale(stored)) return stored;

  const systemLanguage = uni.getSystemInfoSync().language || "";
  return systemLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  messages,
});

/** 切换语言：同时更新 i18n 实例并持久化到本地存储 */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  uni.setStorageSync(LOCALE_STORAGE_KEY, locale);
}

/** 获取当前语言 */
export function getLocale(): Locale {
  return i18n.global.locale.value as Locale;
}

/**
 * 兼容性插值翻译。
 *
 * 优先走 vue-i18n 原生 `t`（小程序运行时下 message compiler 缺失，含 `{x}` 的消息会
 * 原样返回 "{name} 已删除"）；用检测到的字面量兜底：从 messages 里按 key 路径取出
 * 原始模板，手动把 `{name}` 这类占位符替换成入参里对应的值，再降级返回 key 自身。
 *
 * 仅用于「带占位符」的少量提示文案（如删除提示、连接提示），其余无占位符的翻译
 * 仍可直接用 `t("...")`，性能与原方案一致。
 */
export function tt(key: string, params?: Record<string, string | number>): string {
  const global = i18n.global;
  const translated = params
    ? global.t(key, params as Record<string, unknown>)
    : global.t(key);
  // vue-i18n 命中且完成插值时不会残留 "{...}" 占位符；检测到残留即认为编译器缺失
  if (translated && !/\{[\w]+\}/.test(translated)) {
    return translated;
  }

  const template = resolveTemplate(messages[getLocale()], key) || resolveTemplate(messages["zh-CN"], key);
  if (!template) {
    return translated || key;
  }
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

/** 按 `a.b.c` 路径从 locale messages 中取出原始字符串模板 */
function resolveTemplate(root: unknown, dottedKey: string): string | undefined {
  const segments = dottedKey.split(".");
  let node: unknown = root;
  for (const segment of segments) {
    if (node && typeof node === "object" && segment in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}
