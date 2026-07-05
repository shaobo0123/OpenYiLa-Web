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
        :device="device"
        :discovered="discoveredIds.has(device.id)"
        @session-change="refresh"
        @notify="onNotify"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 首页：展示设备列表与开锁入口。
 * - 空状态显示引导卡片；
 * - 有设备时渲染 DeviceCardHero 列表；
 * - 点击一键开锁由卡片直接用设备配置的密码开锁（无需手动输入）。
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import EmptyState from "../../components/EmptyState.vue";
import DeviceCardHero from "../../components/DeviceCardHero.vue";
import { getBleClient } from "../../ble";
import { readDevices } from "../../state/devices";
import { onShow } from "@dcloudio/uni-app";

const { t } = useI18n();

const devices = ref<DeviceRecord[]>([]);
// 本轮扫描发现的设备 id 集合（用于卡片小圆点：绿=在附近，灰=不在）
const discoveredIds = ref<Set<string>>(new Set());

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

/** 重新读取设备列表，并扫一轮判断哪些设备在附近 */
function refresh(): void {
  devices.value = readDevices();
  // 按所有已绑定设备的 name 去重作为扫描前缀，扫一轮点亮"已发现"小圆点
  const prefixes = Array.from(new Set(devices.value.map((d) => d.name).filter(Boolean)));
  if (prefixes.length === 0) {
    discoveredIds.value = new Set();
    return;
  }
  // 先清空，扫描期间小圆点按最新结果点亮
  discoveredIds.value = new Set();
  void getBleClient()
    .discoverOnce(prefixes)
    .then((ids) => {
      discoveredIds.value = ids;
    })
    .catch(() => {
      // 扫描失败保持空集合，小圆点全灰
    });
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
