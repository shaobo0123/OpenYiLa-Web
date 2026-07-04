import "./styles.css";
import { DEFAULT_DEVICE_NAME_PREFIX } from "@yila/core";
import { createTranslator, detectLocale, type Locale, type MessageKey } from "./i18n";
import { YilaWebBleClient } from "./yila-web-ble";

type Settings = {
  openTimeMs: number;
  waitTimeMs: number;
  closeTimeMs: number;
  reverse: boolean;
};

type DeviceRecord = {
  id: string;
  name: string;
  batteryLevel?: number;
  settings: Settings;
  createdAt: number;
  updatedAt: number;
  lastConnectedAt?: number;
  lastOpenedAt?: number;
};

const DEFAULTS = {
  deviceName: DEFAULT_DEVICE_NAME_PREFIX,
  settings: {
    openTimeMs: 1500,
    waitTimeMs: 1000,
    closeTimeMs: 800,
    reverse: false,
  } satisfies Settings,
};

const DEVICES_KEY = "yila.devices";
const SEARCH_PREFIX_KEY = "yila.search.namePrefix";
const client = new YilaWebBleClient();

let locale: Locale = detectLocale();
let t = createTranslator(locale);
let connectedDeviceName = "";
let activeModalDeviceId = "";
let activeAdminDeviceId = "";
let isAddPanelOpen = false;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <section class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">YiLa BLE</p>
          <h1 data-i18n="app.title"></h1>
        </div>
        <div class="header-actions">
          <label class="language-control" for="localeSelect">
            <span data-i18n="locale.label"></span>
            <select id="localeSelect">
              <option value="zh-CN">中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <span id="supportBadge" class="badge"></span>
        </div>
      </header>

      <section id="controlView" class="control-layout">
        <div class="panel devices-panel">
          <div class="section-heading devices-heading">
            <div>
              <h2 data-i18n="device.list"></h2>
              <p data-i18n="device.listHint"></p>
            </div>
            <button id="toggleAddDeviceButton" class="secondary compact-button" type="button" data-i18n="action.addDevice"></button>
          </div>
          <div id="addDevicePanel" class="add-device-panel">
            <label>
              <span data-i18n="device.filter"></span>
              <input id="deviceNamePrefix" value="${DEFAULTS.deviceName}" autocomplete="off" />
            </label>
            <button id="searchDeviceButton" class="secondary" type="button" data-i18n="action.searchDevice"></button>
            <p id="deviceStatus" class="status-line"></p>
          </div>
          <div id="deviceList" class="device-list"></div>
          <p id="result" class="result"></p>
        </div>
      </section>

      <section id="adminView" class="panel admin-panel hidden" data-i18n-aria-label="nav.admin">
        <div class="section-heading admin-heading">
          <div>
            <h2 id="adminDeviceTitle"></h2>
            <p data-i18n="admin.description"></p>
          </div>
          <button id="backToDevicesButton" class="ghost compact-button" type="button" data-i18n="action.back"></button>
        </div>
        <div class="field-grid">
          <label>
            <span data-i18n="field.openTime"></span>
            <input id="openTime" type="number" min="0" max="10000" step="50" />
          </label>
          <label>
            <span data-i18n="field.waitTime"></span>
            <input id="waitTime" type="number" min="0" max="10000" step="50" />
          </label>
          <label>
            <span data-i18n="field.closeTime"></span>
            <input id="closeTime" type="number" min="0" max="10000" step="50" />
          </label>
        </div>
        <label class="toggle-line">
          <input id="reverse" type="checkbox" />
          <span data-i18n="field.reverse"></span>
        </label>
        <div class="settings-summary">
          <span data-i18n="device.battery"></span>
          <strong id="adminBattery"></strong>
        </div>
        <div class="settings-summary">
          <span data-i18n="admin.currentSettings"></span>
          <strong id="settingsSummary"></strong>
        </div>
        <div class="button-row admin-actions">
          <button id="saveSettingsButton" class="secondary" type="button" data-i18n="admin.save"></button>
          <button id="resetSettingsButton" class="ghost" type="button" data-i18n="admin.reset"></button>
          <button id="deleteDeviceButton" class="danger" type="button" data-i18n="action.delete"></button>
        </div>
        <p id="adminResult" class="result"></p>
      </section>
    </section>
  </main>

  <div id="passwordModal" class="modal-backdrop hidden" role="dialog" aria-modal="true">
    <section class="modal">
      <div class="modal-header">
        <div>
          <p class="eyebrow">YiLa BLE</p>
          <h2 id="modalDeviceName"></h2>
        </div>
        <button id="closeModalButton" class="icon-button" type="button" aria-label="Close">×</button>
      </div>
      <label>
        <span data-i18n="field.password"></span>
        <input id="password" inputmode="numeric" maxlength="6" type="password" autocomplete="off" />
      </label>
      <div class="settings-summary">
        <span data-i18n="admin.currentSettings"></span>
        <strong id="modalSettingsSummary"></strong>
      </div>
      <button id="openButton" class="primary" type="button" data-i18n="action.open"></button>
      <p id="modalResult" class="result"></p>
    </section>
  </div>
`;

const supportBadge = byId<HTMLSpanElement>("supportBadge");
const toggleAddDeviceButton = byId<HTMLButtonElement>("toggleAddDeviceButton");
const searchDeviceButton = byId<HTMLButtonElement>("searchDeviceButton");
const openButton = byId<HTMLButtonElement>("openButton");
const closeModalButton = byId<HTMLButtonElement>("closeModalButton");
const statusLine = byId<HTMLParagraphElement>("deviceStatus");
const result = byId<HTMLParagraphElement>("result");
const adminResult = byId<HTMLParagraphElement>("adminResult");
const localeSelect = byId<HTMLSelectElement>("localeSelect");
const controlView = byId<HTMLElement>("controlView");
const adminView = byId<HTMLElement>("adminView");
const backToDevicesButton = byId<HTMLButtonElement>("backToDevicesButton");
const saveSettingsButton = byId<HTMLButtonElement>("saveSettingsButton");
const resetSettingsButton = byId<HTMLButtonElement>("resetSettingsButton");
const deleteDeviceButton = byId<HTMLButtonElement>("deleteDeviceButton");
const adminBattery = byId<HTMLElement>("adminBattery");
const settingsSummary = byId<HTMLElement>("settingsSummary");
const modalSettingsSummary = byId<HTMLElement>("modalSettingsSummary");
const modalDeviceName = byId<HTMLElement>("modalDeviceName");
const modalResult = byId<HTMLParagraphElement>("modalResult");
const passwordModal = byId<HTMLElement>("passwordModal");
const deviceList = byId<HTMLElement>("deviceList");
const adminDeviceTitle = byId<HTMLElement>("adminDeviceTitle");
const deviceNamePrefix = byId<HTMLInputElement>("deviceNamePrefix");

localeSelect.value = locale;
deviceNamePrefix.value = readSearchPrefix();
applyTranslations();
updateBluetoothSupport();
renderDeviceList();
syncAdminPanel();
syncAddDevicePanel();

searchDeviceButton.addEventListener("click", async () => {
  const namePrefix = deviceNamePrefix.value.trim() || DEFAULTS.deviceName;
  saveSearchPrefix(namePrefix);
  setBusy(true, t("status.searching"));
  try {
    const info = await client.connect({ namePrefix });
    const device = upsertDevice({
      id: info.deviceId,
      name: info.deviceName,
      lastConnectedAt: Date.now(),
    });
    connectedDeviceName = info.deviceName;
    selectAdminDevice(device.id);
    isAddPanelOpen = false;
    renderDeviceList();
    syncAdminPanel();
    syncAddDevicePanel();
    statusLine.textContent = t("device.connected", { name: info.deviceName });
    result.textContent = t("device.addedDone");
  } catch (error) {
    result.textContent = errorMessage(error);
  } finally {
    setBusy(false);
  }
});

openButton.addEventListener("click", async () => {
  const device = findDevice(activeModalDeviceId);
  if (!device) {
    modalResult.textContent = t("device.none");
    closePasswordModal();
    return;
  }

  const password = byId<HTMLInputElement>("password").value.trim();
  if (!/^\d{6}$/.test(password)) {
    modalResult.textContent = t("status.passwordInvalid");
    return;
  }

  setBusy(true, t("status.opening"), modalResult);
  try {
    if (!client.connected) {
      const info = await client.connect({ namePrefix: device.name || readSearchPrefix() });
      connectedDeviceName = info.deviceName;
      upsertDevice({
        id: info.deviceId,
        name: info.deviceName,
        lastConnectedAt: Date.now(),
      });
      renderDeviceList();
      syncAdminPanel();
    }

    const response = await client.open({
      password,
      openTimeMs: device.settings.openTimeMs,
      waitTimeMs: device.settings.waitTimeMs,
      closeTimeMs: device.settings.closeTimeMs,
      reverse: device.settings.reverse,
    });

    upsertDevice({
      ...device,
      lastOpenedAt: Date.now(),
      ...(response.batteryLevel ? { batteryLevel: response.batteryLevel } : {}),
    });
    renderDeviceList();
    syncAddDevicePanel();
    syncAdminPanel();

    modalResult.textContent = response.success
      ? t("status.unlockSuccess")
      : t("status.unlockFailed", { message: response.message });
    if (response.batteryLevel) {
      modalResult.textContent += ` · ${t("status.battery", { level: response.batteryLevel })}`;
    }
    result.textContent = modalResult.textContent;
    closePasswordModal();
  } catch (error) {
    modalResult.textContent = errorMessage(error);
  } finally {
    setBusy(false);
  }
});

closeModalButton.addEventListener("click", closePasswordModal);
passwordModal.addEventListener("click", (event) => {
  if (event.target === passwordModal) {
    closePasswordModal();
  }
});

localeSelect.addEventListener("change", () => {
  locale = localeSelect.value as Locale;
  t = createTranslator(locale);
  applyTranslations();
  updateBluetoothSupport();
  renderDeviceList();
  syncAdminPanel();
  syncAddDevicePanel();
});

toggleAddDeviceButton.addEventListener("click", () => {
  isAddPanelOpen = !isAddPanelOpen;
  syncAddDevicePanel();
  if (isAddPanelOpen) {
    deviceNamePrefix.focus();
  }
});

backToDevicesButton.addEventListener("click", () => setView("control"));

deviceNamePrefix.addEventListener("change", () => {
  saveSearchPrefix(deviceNamePrefix.value.trim() || DEFAULTS.deviceName);
});

saveSettingsButton.addEventListener("click", () => {
  const device = getSelectedAdminDevice();
  if (!device) {
    adminResult.textContent = t("admin.noDevice");
    return;
  }

  const updated = updateDeviceSettings(device.id, readSettingsFromForm());
  if (!updated) {
    adminResult.textContent = t("admin.noDevice");
    return;
  }

  renderDeviceList();
  syncAdminPanel();
  syncAddDevicePanel();
  adminResult.textContent = t("admin.savedFor", { name: updated.name });
});

resetSettingsButton.addEventListener("click", () => {
  const device = getSelectedAdminDevice();
  if (!device) {
    adminResult.textContent = t("admin.noDevice");
    return;
  }

  const updated = updateDeviceSettings(device.id, DEFAULTS.settings);
  if (!updated) {
    adminResult.textContent = t("admin.noDevice");
    return;
  }

  loadSettingsIntoForm(updated.settings);
  renderDeviceList();
  syncAdminPanel();
  syncAddDevicePanel();
  adminResult.textContent = t("admin.resetDoneFor", { name: updated.name });
});

deleteDeviceButton.addEventListener("click", () => {
  const device = getSelectedAdminDevice();
  if (!device) {
    adminResult.textContent = t("admin.noDevice");
    return;
  }
  deleteDevice(device.id);
});

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function setBusy(isBusy: boolean, message?: string, target: HTMLElement = result): void {
  searchDeviceButton.disabled = isBusy;
  openButton.disabled = isBusy;
  if (message) {
    target.textContent = message;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyTranslations(): void {
  document.documentElement.lang = locale;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n as MessageKey);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel as MessageKey));
  });
  statusLine.textContent = connectedDeviceName
    ? t("device.connected", { name: connectedDeviceName })
    : t("device.notConnected");
  if (!result.textContent || result.textContent === "Ready" || result.textContent === "就绪") {
    result.textContent = t("status.ready");
  }
}

function updateBluetoothSupport(): void {
  supportBadge.textContent = navigator.bluetooth ? t("app.badge.ready") : t("app.badge.unsupported");
  supportBadge.classList.toggle("warning", !navigator.bluetooth);
}

function renderDeviceList(): void {
  const devices = readDevices();
  if (devices.length === 0) {
    deviceList.innerHTML = "";
    return;
  }

  deviceList.innerHTML = devices
    .map(
      (device) => `
        <article class="device-card">
          <button class="device-open-area" type="button" data-open-device-id="${escapeHtml(device.id)}">
            <span class="device-card-icon" aria-hidden="true">
              <svg class="lock-icon" viewBox="0 0 48 48" focusable="false">
                <path d="M15 21v-4a9 9 0 0 1 18 0v4" />
                <rect x="12" y="20" width="24" height="20" rx="5" />
                <path d="M24 28v6" />
              </svg>
            </span>
            <span class="device-card-info">
              <strong>${escapeHtml(device.name)}</strong>
              <small>${escapeHtml(formatDeviceMeta(device))}</small>
            </span>
          </button>
          <div class="device-card-actions">
            <button class="secondary compact-button" type="button" data-open-device-id="${escapeHtml(device.id)}">${escapeHtml(t("action.open"))}</button>
            <button class="ghost compact-button" type="button" data-manage-device-id="${escapeHtml(device.id)}">${escapeHtml(t("action.manage"))}</button>
          </div>
        </article>
      `,
    )
    .join("");

  deviceList.querySelectorAll<HTMLButtonElement>("[data-open-device-id]").forEach((button) => {
    button.addEventListener("click", () => openPasswordModal(button.dataset.openDeviceId || ""));
  });
  deviceList.querySelectorAll<HTMLButtonElement>("[data-manage-device-id]").forEach((button) => {
    button.addEventListener("click", () => openAdminForDevice(button.dataset.manageDeviceId || ""));
  });
}

function openPasswordModal(deviceId: string): void {
  const device = findDevice(deviceId);
  if (!device) {
    result.textContent = t("device.none");
    return;
  }

  activeModalDeviceId = device.id;
  modalDeviceName.textContent = device.name;
  modalSettingsSummary.textContent = formatDeviceMeta(device);
  modalResult.textContent = "";
  byId<HTMLInputElement>("password").value = "";
  passwordModal.classList.remove("hidden");
  byId<HTMLInputElement>("password").focus();
}

function closePasswordModal(): void {
  passwordModal.classList.add("hidden");
}

function openAdminForDevice(deviceId: string): void {
  const device = findDevice(deviceId);
  if (!device) {
    result.textContent = t("device.none");
    return;
  }

  selectAdminDevice(device.id);
  syncAdminPanel();
  adminResult.textContent = "";
  setView("admin");
}

function deleteDevice(deviceId: string): void {
  const device = findDevice(deviceId);
  if (!device) {
    result.textContent = t("device.none");
    return;
  }
  if (!window.confirm(t("device.deleteConfirm", { name: device.name }))) {
    return;
  }

  const nextDevices = readDevices().filter((item) => item.id !== device.id);
  saveDevices(nextDevices);
  if (activeAdminDeviceId === device.id) {
    selectAdminDevice("");
  }
  if (activeModalDeviceId === device.id) {
    closePasswordModal();
    activeModalDeviceId = "";
  }
  renderDeviceList();
  syncAdminPanel();
  syncAddDevicePanel();
  setView("control");
  result.textContent = t("device.deleted", { name: device.name });
}

function syncAddDevicePanel(): void {
  const hasDevices = readDevices().length > 0;
  const shouldShowPanel = !hasDevices || isAddPanelOpen;
  byId<HTMLElement>("addDevicePanel").classList.toggle("hidden", !shouldShowPanel);
  toggleAddDeviceButton.classList.toggle("hidden", !hasDevices);
}

function syncAdminPanel(): void {
  const device = getSelectedAdminDevice();
  adminDeviceTitle.textContent = device ? t("admin.titleFor", { name: device.name }) : t("admin.title");
  const settings = device?.settings || DEFAULTS.settings;
  loadSettingsIntoForm(settings);
  setSettingsFormEnabled(Boolean(device));
  adminBattery.textContent = device ? formatBattery(device) : t("admin.noDevice");
  updateSettingsSummary(device);
}

function selectAdminDevice(deviceId: string): void {
  activeAdminDeviceId = deviceId;
}

function getSelectedAdminDevice(): DeviceRecord | null {
  return activeAdminDeviceId ? findDevice(activeAdminDeviceId) : null;
}

function readDevices(): DeviceRecord[] {
  const raw = localStorage.getItem(DEVICES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<DeviceRecord>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((device) => device.id && device.name)
      .map((device) => {
        const record: DeviceRecord = {
          id: String(device.id),
          name: String(device.name),
          settings: normalizeSettings(device.settings || {}),
          createdAt: normalizeTimestamp(device.createdAt),
          updatedAt: normalizeTimestamp(device.updatedAt),
        };
        const batteryLevel = normalizeBatteryLevel(device.batteryLevel);
        const lastConnectedAt = normalizeOptionalTimestamp(device.lastConnectedAt);
        const lastOpenedAt = normalizeOptionalTimestamp(device.lastOpenedAt);
        if (batteryLevel) {
          record.batteryLevel = batteryLevel;
        }
        if (lastConnectedAt) {
          record.lastConnectedAt = lastConnectedAt;
        }
        if (lastOpenedAt) {
          record.lastOpenedAt = lastOpenedAt;
        }
        return record;
      });
  } catch {
    return [];
  }
}

function saveDevices(devices: DeviceRecord[]): void {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

function findDevice(deviceId: string): DeviceRecord | null {
  return readDevices().find((device) => device.id === deviceId) || null;
}

function upsertDevice(input: Partial<DeviceRecord> & Pick<DeviceRecord, "id" | "name">): DeviceRecord {
  const devices = readDevices();
  const now = Date.now();
  const index = devices.findIndex((device) => device.id === input.id);
  const existing = index >= 0 ? devices[index] : null;
  const device: DeviceRecord = {
    id: input.id,
    name: input.name,
    settings: normalizeSettings(input.settings || existing?.settings || DEFAULTS.settings),
    createdAt: input.createdAt || existing?.createdAt || now,
    updatedAt: now,
  };
  const lastConnectedAt = input.lastConnectedAt || existing?.lastConnectedAt;
  const lastOpenedAt = input.lastOpenedAt || existing?.lastOpenedAt;
  const batteryLevel = normalizeBatteryLevel(input.batteryLevel) || existing?.batteryLevel;
  if (batteryLevel) {
    device.batteryLevel = batteryLevel;
  }
  if (lastConnectedAt) {
    device.lastConnectedAt = lastConnectedAt;
  }
  if (lastOpenedAt) {
    device.lastOpenedAt = lastOpenedAt;
  }

  if (index >= 0) {
    devices[index] = device;
  } else {
    devices.push(device);
  }
  saveDevices(devices);
  return device;
}

function updateDeviceSettings(deviceId: string, settings: Settings): DeviceRecord | null {
  const device = findDevice(deviceId);
  if (!device) {
    return null;
  }
  return upsertDevice({ ...device, settings });
}

function readSearchPrefix(): string {
  return localStorage.getItem(SEARCH_PREFIX_KEY) || DEFAULTS.deviceName;
}

function saveSearchPrefix(namePrefix: string): void {
  localStorage.setItem(SEARCH_PREFIX_KEY, namePrefix);
}

function setView(view: "control" | "admin"): void {
  controlView.classList.toggle("hidden", view !== "control");
  adminView.classList.toggle("hidden", view !== "admin");
}

function readSettingsFromForm(): Settings {
  return normalizeSettings({
    openTimeMs: Number(byId<HTMLInputElement>("openTime").value),
    waitTimeMs: Number(byId<HTMLInputElement>("waitTime").value),
    closeTimeMs: Number(byId<HTMLInputElement>("closeTime").value),
    reverse: byId<HTMLInputElement>("reverse").checked,
  });
}

function loadSettingsIntoForm(settings: Settings): void {
  byId<HTMLInputElement>("openTime").value = String(settings.openTimeMs);
  byId<HTMLInputElement>("waitTime").value = String(settings.waitTimeMs);
  byId<HTMLInputElement>("closeTime").value = String(settings.closeTimeMs);
  byId<HTMLInputElement>("reverse").checked = settings.reverse;
}

function setSettingsFormEnabled(enabled: boolean): void {
  byId<HTMLInputElement>("openTime").disabled = !enabled;
  byId<HTMLInputElement>("waitTime").disabled = !enabled;
  byId<HTMLInputElement>("closeTime").disabled = !enabled;
  byId<HTMLInputElement>("reverse").disabled = !enabled;
  saveSettingsButton.disabled = !enabled;
  resetSettingsButton.disabled = !enabled;
  deleteDeviceButton.disabled = !enabled;
}

function normalizeSettings(settings: Partial<Settings>): Settings {
  return {
    openTimeMs: clampTime(settings.openTimeMs, DEFAULTS.settings.openTimeMs),
    waitTimeMs: clampTime(settings.waitTimeMs, DEFAULTS.settings.waitTimeMs),
    closeTimeMs: clampTime(settings.closeTimeMs, DEFAULTS.settings.closeTimeMs),
    reverse: Boolean(settings.reverse),
  };
}

function clampTime(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(10000, Math.max(0, Math.round(numberValue)));
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function normalizeOptionalTimestamp(value: unknown): number | undefined {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

function normalizeBatteryLevel(value: unknown): number | undefined {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : undefined;
}

function updateSettingsSummary(device: DeviceRecord | null): void {
  settingsSummary.textContent = device ? formatSettings(device.settings) : t("admin.noDevice");
  modalSettingsSummary.textContent = device ? formatDeviceMeta(device) : t("admin.noDevice");
}

function formatSettings(settings: Settings): string {
  return `${settings.openTimeMs}/${settings.waitTimeMs}/${settings.closeTimeMs}ms · ${
    formatDirection(settings)
  }`;
}

function formatDirection(settings: Settings): string {
  return settings.reverse ? t("admin.reverseOn") : t("admin.reverseOff");
}

function formatBattery(device: DeviceRecord): string {
  return device.batteryLevel ? t("status.battery", { level: device.batteryLevel }) : t("device.batteryUnknown");
}

function formatDeviceMeta(device: DeviceRecord): string {
  return `${formatDirection(device.settings)} · ${formatBattery(device)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char]!;
  });
}
