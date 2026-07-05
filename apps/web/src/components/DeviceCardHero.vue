<template>
  <view class="device-card">
    <view class="card-head">
      <view class="device-title">
        <text class="device-name">{{ device.name }}</text>
        <view class="tag-row">
          <view class="status-dot" :class="connected ? 'status-dot--on' : 'status-dot--off'" />
          <wd-tag round>{{ batteryText }}</wd-tag>
        </view>
      </view>
      <wd-button type="text" size="small" icon="setting" @click="onManageClick" />
    </view>

    <view class="tile-action" :class="{ 'tile-action--busy': busy }" @click="onUnlockClick">
      <view class="unlock-icon">
        <wd-icon name="lock-off" size="88rpx" color="#ffffff" />
      </view>
      <text class="unlock-label">{{ busy ? t("status.opening") : t("action.open") }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 设备主卡片（首页）：展示设备名/连接状态/电量，并提供一键开锁入口。
 * 点击一键开锁直接用设备里配置好的密码开锁（默认 123456，可在管理页修改）。
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { getBleClient } from "../ble";
import { errorMessage, withDeviceConnection } from "../ble/helpers";
import { upsertDevice, type DeviceRecord } from "../state/devices";
import { tt } from "../i18n";

const { t } = useI18n();

const props = defineProps<{
  device: DeviceRecord;
  connected: boolean;
}>();

const emit = defineEmits<{
  /** 连接状态/电量发生变化，通知父组件刷新 */
  sessionChange: [];
  /** 通知父组件弹 toast（含是否为错误） */
  notify: [message: string, isError: boolean];
}>();

const busy = ref(false);

const batteryText = computed(() =>
  props.device.batteryLevel
    ? tt("status.battery", { level: props.device.batteryLevel })
    : t("device.batteryUnknown"),
);

function onManageClick(): void {
  uni.navigateTo({
    url: `/pages/manage/manage?id=${encodeURIComponent(props.device.id)}`,
  });
}

/** 点击一键开锁：直接用设备配置的密码开锁，无需手动输入 */
async function onUnlockClick(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    // 按需连接：连上 → 下发开锁命令 → 自动断开，不长期占用 GATT
    const response = await withDeviceConnection(props.device, async (target) => {
      const client = getBleClient();
      return client.open({
        password: target.password,
        openTimeMs: target.settings.openTimeMs,
        waitTimeMs: target.settings.waitTimeMs,
        closeTimeMs: target.settings.closeTimeMs,
        reverse: target.settings.reverse,
      });
    });

    // 回写最近开锁时间 + 电量（基于连接时拿到的最新设备记录）
    upsertDevice({
      ...props.device,
      lastOpenedAt: Date.now(),
      ...(response.batteryLevel ? { batteryLevel: response.batteryLevel } : {}),
    });

    // 通知父组件展示结果并刷新
    const msg = response.success
      ? t("status.unlockSuccess")
      : tt("status.unlockFailed", { message: response.message });
    const suffix = response.batteryLevel
      ? ` · ${tt("status.battery", { level: response.batteryLevel })}`
      : "";
    emit("notify", msg + suffix, !response.success);
    emit("sessionChange");
  } catch (error) {
    emit("notify", errorMessage(error), true);
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss" scoped>
.device-card {
  display: grid;
  gap: 34rpx;
  padding: 34rpx;
  border: 1px solid rgba(46, 125, 82, 0.12);
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 18rpx 44rpx rgba(23, 61, 43, 0.08);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
}

.device-title {
  min-width: 0;
}

.device-name {
  display: block;
  margin-bottom: 12rpx;
  color: #173d2b;
  font-size: 40rpx;
  font-weight: 800;
  word-break: break-all;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
}

/* 连接状态小圆点：绿=蓝牙已连，灰=未连接 */
.status-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--on {
  background: #2e7d52;
  box-shadow: 0 0 0 4rpx rgba(46, 125, 82, 0.18);
}

.status-dot--off {
  background: #c2c9c4;
}

.tile-action {
  display: grid;
  justify-items: center;
  gap: 18rpx;
  padding: 30rpx 0 12rpx;
}

.tile-action--busy {
  opacity: 0.72;
}

.unlock-icon {
  display: grid;
  place-items: center;
  width: 176rpx;
  height: 176rpx;
  border-radius: 50%;
  background: #2e7d52;
  box-shadow: 0 18rpx 42rpx rgba(46, 125, 82, 0.24);
}

.unlock-label {
  color: #173d2b;
  font-size: 30rpx;
  font-weight: 800;
}
</style>
