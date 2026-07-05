import { createI18n } from "vue-i18n";

export type Locale = "zh-CN" | "en-US";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
];

const LOCALE_STORAGE_KEY = "yila.locale";

const messages = {
  "zh-CN": {
    app: {
      title: "YiLa 开门",
      badgeReady: "蓝牙可用",
      badgeUnsupported: "不支持",
    },
    device: {
      empty: "还没有设备",
      emptyHint: "点击右上角添加你的第一把 YiLa 锁",
      addTitle: "添加设备",
      addHint: "搜索并添加 YiLa 蓝牙设备",
      addedDone: "设备已添加",
      list: "我的设备",
      none: "未添加设备",
      deleteConfirm: "确定删除 {name} 吗？",
      deleted: "{name} 已删除",
      battery: "电量",
      batteryUnknown: "电量未知",
      filter: "搜索名称前缀",
      notConnected: "未连接",
      connected: "{name} 已连接",
      connectedShort: "已连接",
      offlineShort: "离线",
    },
    action: {
      addDevice: "添加设备",
      searchDevice: "搜索添加",
      open: "一键开锁",
      delete: "删除",
      back: "返回",
      changePassword: "修改密码",
      confirmChangePassword: "确认修改",
      timing: "时序",
      password: "密码",
      manage: "管理",
      confirm: "确认",
      cancel: "取消",
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
      ready: "就绪",
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
      title: "设备管理",
      titleFor: "{name} 设置",
      noDevice: "未选择设备",
      currentSettings: "当前设置",
      savedFor: "{name} 的设置已保存",
      resetDoneFor: "{name} 已恢复默认设置",
      passwordTitle: "修改密码",
      reverseOn: "反向",
      reverseOff: "正常",
      timingTitle: "开锁时序",
    },
  },

  "en-US": {
    app: {
      title: "YiLa Unlock",
      badgeReady: "Bluetooth Ready",
      badgeUnsupported: "Unsupported",
    },
    device: {
      empty: "No device yet",
      emptyHint: "Tap the top-right button to add your first YiLa lock.",
      addTitle: "Add Device",
      addHint: "Search and add a YiLa Bluetooth device",
      addedDone: "Device added",
      list: "My Devices",
      none: "No device added",
      deleteConfirm: "Delete {name}?",
      deleted: "{name} deleted",
      battery: "Battery",
      batteryUnknown: "Battery unknown",
      filter: "Search name prefix",
      notConnected: "Not connected",
      connected: "{name} connected",
      connectedShort: "Connected",
      offlineShort: "Offline",
    },
    action: {
      addDevice: "Add Device",
      searchDevice: "Search",
      open: "Unlock",
      delete: "Delete",
      back: "Back",
      changePassword: "Change Password",
      confirmChangePassword: "Confirm Change",
      timing: "Timing",
      password: "Password",
      manage: "Manage",
      confirm: "Confirm",
      cancel: "Cancel",
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
      ready: "Ready",
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
      title: "Device Admin",
      titleFor: "{name} Settings",
      noDevice: "No device selected",
      currentSettings: "Current settings",
      savedFor: "Settings saved for {name}",
      resetDoneFor: "Defaults restored for {name}",
      passwordTitle: "Change password",
      reverseOn: "Reverse",
      reverseOff: "Normal",
      timingTitle: "Unlock timing",
    },
  },
};

function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.value === value);
}

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

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  uni.setStorageSync(LOCALE_STORAGE_KEY, locale);
}

export function getLocale(): Locale {
  return i18n.global.locale.value as Locale;
}
