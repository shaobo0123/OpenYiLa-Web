export type Locale = "zh-CN" | "en-US";

export type MessageKey =
  | "app.title"
  | "app.badge.ready"
  | "app.badge.unsupported"
  | "device.addedDone"
  | "device.addTitle"
  | "device.addHint"
  | "device.list"
  | "device.listHint"
  | "device.none"
  | "device.deleteConfirm"
  | "device.deleted"
  | "device.battery"
  | "device.batteryUnknown"
  | "device.filter"
  | "device.notConnected"
  | "device.connected"
  | "action.addDevice"
  | "action.searchDevice"
  | "action.open"
  | "action.manage"
  | "action.delete"
  | "action.back"
  | "action.changePassword"
  | "action.confirmChangePassword"
  | "nav.admin"
  | "field.password"
  | "field.oldPassword"
  | "field.newPassword"
  | "field.confirmPassword"
  | "field.openTime"
  | "field.waitTime"
  | "field.closeTime"
  | "field.reverse"
  | "status.ready"
  | "status.searching"
  | "status.opening"
  | "status.changingPassword"
  | "status.passwordInvalid"
  | "status.passwordMismatch"
  | "status.passwordChangeSuccess"
  | "status.passwordChangeFailed"
  | "status.unlockSuccess"
  | "status.unlockFailed"
  | "status.battery"
  | "locale.label"
  | "admin.title"
  | "admin.titleFor"
  | "admin.description"
  | "admin.noDevice"
  | "admin.currentSettings"
  | "admin.save"
  | "admin.reset"
  | "admin.savedFor"
  | "admin.resetDoneFor"
  | "admin.passwordTitle"
  | "admin.reverseOn"
  | "admin.reverseOff";

const messages: Record<Locale, Record<MessageKey, string>> = {
  "zh-CN": {
    "app.title": "网页开门",
    "app.badge.ready": "蓝牙可用",
    "app.badge.unsupported": "不支持",
    "device.addedDone": "设备已添加，点击设备图标输入密码开门",
    "device.addTitle": "添加设备",
    "device.addHint": "在这里搜索并添加 YiLa 蓝牙设备。",
    "device.list": "我的设备",
    "device.listHint": "每个设备卡片都可以开门或进入设置。",
    "device.none": "未添加设备",
    "device.deleteConfirm": "确定删除 {name} 吗？",
    "device.deleted": "{name} 已删除",
    "device.battery": "电量",
    "device.batteryUnknown": "电量未知",
    "device.filter": "搜索名称前缀",
    "device.notConnected": "未连接",
    "device.connected": "{name} 已连接",
    "action.addDevice": "添加设备",
    "action.searchDevice": "搜索添加设备",
    "action.open": "开门",
    "action.manage": "设置",
    "action.delete": "删除",
    "action.back": "返回",
    "action.changePassword": "修改密码",
    "action.confirmChangePassword": "确认修改",
    "nav.admin": "管理后台",
    "field.password": "设备密码",
    "field.oldPassword": "当前密码",
    "field.newPassword": "新密码",
    "field.confirmPassword": "确认新密码",
    "field.openTime": "开锁时间",
    "field.waitTime": "等待时间",
    "field.closeTime": "关锁时间",
    "field.reverse": "反向开锁",
    "status.ready": "就绪",
    "status.searching": "正在搜索设备...",
    "status.opening": "正在开门...",
    "status.changingPassword": "正在修改密码...",
    "status.passwordInvalid": "密码必须是 6 位数字",
    "status.passwordMismatch": "两次输入的新密码不一致",
    "status.passwordChangeSuccess": "密码修改成功",
    "status.passwordChangeFailed": "密码修改失败：{message}",
    "status.unlockSuccess": "开门成功",
    "status.unlockFailed": "开门失败：{message}",
    "status.battery": "电量 {level}/5",
    "locale.label": "语言",
    "admin.title": "管理后台",
    "admin.titleFor": "{name} 设置",
    "admin.description": "这里设置当前设备自己的开门时序和方向。",
    "admin.noDevice": "未选择设备",
    "admin.currentSettings": "当前设置",
    "admin.save": "保存设置",
    "admin.reset": "恢复默认",
    "admin.savedFor": "{name} 的设置已保存",
    "admin.resetDoneFor": "{name} 已恢复默认设置",
    "admin.passwordTitle": "修改密码",
    "admin.reverseOn": "反向",
    "admin.reverseOff": "正常",
  },
  "en-US": {
    "app.title": "Web Control",
    "app.badge.ready": "Bluetooth Ready",
    "app.badge.unsupported": "Unsupported",
    "device.addedDone": "Device added. Click the device icon and enter the password.",
    "device.addTitle": "Add Device",
    "device.addHint": "Search and add a YiLa Bluetooth device here.",
    "device.list": "My Devices",
    "device.listHint": "Each device card can open or configure the device.",
    "device.none": "No device added",
    "device.deleteConfirm": "Delete {name}?",
    "device.deleted": "{name} deleted",
    "device.battery": "Battery",
    "device.batteryUnknown": "Battery unknown",
    "device.filter": "Search name prefix",
    "device.notConnected": "Not connected",
    "device.connected": "{name} connected",
    "action.addDevice": "Add Device",
    "action.searchDevice": "Search Device",
    "action.open": "Open Door",
    "action.manage": "Settings",
    "action.delete": "Delete",
    "action.back": "Back",
    "action.changePassword": "Change Password",
    "action.confirmChangePassword": "Confirm Change",
    "nav.admin": "Admin",
    "field.password": "Password",
    "field.oldPassword": "Current password",
    "field.newPassword": "New password",
    "field.confirmPassword": "Confirm new password",
    "field.openTime": "Open time",
    "field.waitTime": "Wait time",
    "field.closeTime": "Close time",
    "field.reverse": "Reverse direction",
    "status.ready": "Ready",
    "status.searching": "Searching for device...",
    "status.opening": "Opening...",
    "status.changingPassword": "Changing password...",
    "status.passwordInvalid": "Password must be 6 digits",
    "status.passwordMismatch": "New passwords do not match",
    "status.passwordChangeSuccess": "Password changed",
    "status.passwordChangeFailed": "Password change failed: {message}",
    "status.unlockSuccess": "Unlock success",
    "status.unlockFailed": "Unlock failed: {message}",
    "status.battery": "Battery {level}/5",
    "locale.label": "Language",
    "admin.title": "Admin",
    "admin.titleFor": "{name} Settings",
    "admin.description": "Edit timing and direction for this device.",
    "admin.noDevice": "No device selected",
    "admin.currentSettings": "Current settings",
    "admin.save": "Save settings",
    "admin.reset": "Reset defaults",
    "admin.savedFor": "Settings saved for {name}",
    "admin.resetDoneFor": "Defaults restored for {name}",
    "admin.passwordTitle": "Change password",
    "admin.reverseOn": "Reverse",
    "admin.reverseOff": "Normal",
  },
};

export function detectLocale(): Locale {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function createTranslator(locale: Locale): (key: MessageKey, values?: Record<string, string | number>) => string {
  return (key, values = {}) => {
    let message = messages[locale][key];
    for (const [name, value] of Object.entries(values)) {
      message = message.replace(`{${name}}`, String(value));
    }
    return message;
  };
}
