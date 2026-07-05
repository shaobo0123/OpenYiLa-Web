<template>
  <view class="shell" :style="shellStyle">
    <view class="hero">
      <view>
        <text class="eyebrow">OpenYiLa BLE</text>
        <text class="title">{{ t("app.title") }}</text>
      </view>
      <view class="hero-actions">
        <wd-tag :type="bleSupported ? 'success' : 'warning'" round>{{ supportText }}</wd-tag>
        <wd-button type="text" size="small" icon="setting" @click="goSettings" />
        <wd-button type="primary" size="small" prefix="add" @click="goAddDevice">
          {{ t("action.addDevice") }}
        </wd-button>
      </view>
    </view>

    <EmptyState v-if="devices.length === 0" @add="goAddDevice" />

    <view v-else class="device-area" :class="{ 'device-area--single': devices.length === 1 }">
      <DeviceCardHero
        v-for="device in devices"
        :key="device.id"
        ref="deviceCardRefs"
        :device="device"
        :connected="connectedDeviceId === device.id"
        @session-change="refresh"
        @notify="onNotify"
        @request-unlock="onRequestUnlock"
      />
    </view>

    <UnlockSheet
      :visible="unlockSheet.visible"
      :device-name="unlockSheet.deviceName"
      :meta="unlockSheet.meta"
      :busy="unlockSheet.busy"
      :busy-label="t('status.opening')"
      :message="unlockSheet.message"
      :is-error="unlockSheet.isError"
      @close="closeUnlockSheet"
      @confirm="onUnlockConfirm"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 首页：展示设备列表与开锁入口。
 * - 空状态显示引导卡片；
 * - 有设备时渲染 DeviceCardHero 列表；
 * - 点击开锁弹出 UnlockSheet 输入密码，确认后调用对应卡片的 performUnlock。
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import EmptyState from "../../components/EmptyState.vue";
import DeviceCardHero from "../../components/DeviceCardHero.vue";
import UnlockSheet from "../../components/UnlockSheet.vue";
import { getBleClient } from "../../ble";
import { readDevices, upsertDevice, type DeviceRecord } from "../../state/devices";
import { onShow } from "@dcloudio/uni-app";

const { t } = useI18n();

const devices = ref<DeviceRecord[]>([]);
const connectedDeviceId = ref<string | null>(null);
// 设备卡片组件实例列表，用于通过 ref 调用 performUnlock
const deviceCardRefs = ref<InstanceType<typeof DeviceCardHero>[]>([]);

// 开锁弹层的全部状态（合并到一个 ref 便于整体重置）
const unlockSheet = ref({
  visible: false,
  deviceName: "",
  meta: "",
  busy: false,
  message: "",
  isError: false,
  deviceId: "",
});

const bleSupported = ref(true);
const shellPaddingTop = ref("48rpx");
const supportText = computed(() =>
  bleSupported.value ? t("app.badgeReady") : t("app.badgeUnsupported"),
);
const shellStyle = computed(() => ({
  paddingTop: shellPaddingTop.value,
}));

onMounted(() => {
  updateCustomNavigationInset();
  refresh();
  checkBleSupport();
});

// 页面每次重新可见时刷新（从添加/管理页返回时也要刷新）
onShow(() => {
  refresh();
});

/** 重新读取设备列表与当前连接状态 */
function refresh(): void {
  devices.value = readDevices();
  connectedDeviceId.value = getBleClient().connectedDeviceId;
}

/** 检测当前端是否支持蓝牙（仅 H5 真正需要探测） */
function checkBleSupport(): void {
  // #ifdef H5
  bleSupported.value = Boolean(navigator.bluetooth);
  // #endif
  // #ifndef H5
  bleSupported.value = true;
  // #endif
}

/** 首页使用 custom navigation，需要避开微信状态栏和右上角胶囊按钮。 */
function updateCustomNavigationInset(): void {
  // #ifdef MP-WEIXIN
  const wxUni = uni as unknown as {
    getMenuButtonBoundingClientRect?: () => { bottom: number };
    getWindowInfo?: () => { statusBarHeight?: number };
    getSystemInfoSync?: () => { statusBarHeight?: number };
  };
  const menuButton = wxUni.getMenuButtonBoundingClientRect?.();
  if (menuButton?.bottom) {
    shellPaddingTop.value = `${menuButton.bottom + 12}px`;
    return;
  }
  const windowInfo = wxUni.getWindowInfo?.() ?? wxUni.getSystemInfoSync?.();
  shellPaddingTop.value = `${(windowInfo?.statusBarHeight ?? 24) + 48}px`;
  // #endif
}

function onNotify(message: string, isError: boolean): void {
  if (!message) return;
  // 用 wot 的 toast（通过 uni.$wot 全局调用）
  uni.showToast({
    title: message,
    icon: isError ? "error" : "success",
    duration: 2500,
  });
}

function goAddDevice(): void {
  uni.navigateTo({ url: "/pages/add/add" });
}

function goSettings(): void {
  uni.navigateTo({ url: "/pages/settings/settings" });
}

/** 用户点了某个卡片的「开锁」：弹出密码输入层 */
function onRequestUnlock(device: DeviceRecord): void {
  unlockSheet.value = {
    visible: true,
    deviceName: device.name,
    meta: formatDeviceMeta(device),
    busy: false,
    message: "",
    isError: false,
    deviceId: device.id,
  };
}

function closeUnlockSheet(): void {
  unlockSheet.value.visible = false;
}

/** 密码确认：关掉弹层，找到对应卡片实例并调用其 performUnlock */
async function onUnlockConfirm(password: string): Promise<void> {
  const deviceId = unlockSheet.value.deviceId;
  const card = deviceCardRefs.value.find(
    (c) => (c as unknown as { getDeviceId?: () => string }).getDeviceId?.() === deviceId,
  );
  unlockSheet.value.busy = true;
  unlockSheet.value.message = "";
  unlockSheet.value.visible = false;
  if (
    card &&
    typeof (card as unknown as { performUnlock?: (p: string) => void }).performUnlock === "function"
  ) {
    (card as unknown as { performUnlock: (p: string) => void }).performUnlock(password);
  } else {
    onNotify(t("admin.noDevice"), true);
  }
  unlockSheet.value.busy = false;
}

/** 拼装开锁弹层右上角的元信息：方向 · 电量 */
function formatDeviceMeta(device: DeviceRecord): string {
  const dir = device.settings.reverse ? t("admin.reverseOn") : t("admin.reverseOff");
  const bat = device.batteryLevel
    ? t("status.battery", { level: device.batteryLevel })
    : t("device.batteryUnknown");
  return `${dir} · ${bat}`;
}
</script>

<style lang="scss" scoped>
.shell {
  min-height: 100vh;
  max-width: 860rpx;
  margin: 0 auto;
  padding: 48rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  display: grid;
  align-content: start;
  gap: 28rpx;
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
}

.eyebrow,
.title {
  display: block;
}

.eyebrow {
  color: #5c6560;
  font-size: 22rpx;
  font-weight: 700;
}

.title {
  margin-top: 6rpx;
  color: #173d2b;
  font-size: 48rpx;
  font-weight: 800;
  line-height: 1.15;
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12rpx;
}

.device-area {
  display: grid;
  gap: 28rpx;
}

.device-area--single {
  min-height: 60vh;
  align-content: center;
}
</style>
