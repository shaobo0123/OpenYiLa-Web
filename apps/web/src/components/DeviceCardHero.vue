<template>
  <view class="device-card">
    <view class="card-head">
      <view class="device-title">
        <text class="device-name">{{ device.name }}</text>
        <view class="tag-row">
          <wd-tag :type="connected ? 'success' : 'default'" round>
            {{ connected ? t("device.connectedShort") : t("device.offlineShort") }}
          </wd-tag>
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
 * 开锁时先校验密码格式，再走 BLE 连接 → 下发开锁命令 → 回写设备状态。
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { getBleClient } from "../ble";
import { ensureConnectedToDevice, errorMessage } from "../ble/helpers";
import { upsertDevice, type DeviceRecord } from "../state/devices";

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
  /** 用户点了开锁按钮，请求父组件弹出密码输入面板 */
  requestUnlock: [device: DeviceRecord];
}>();

const busy = ref(false);

const batteryText = computed(() =>
  props.device.batteryLevel
    ? t("status.battery", { level: props.device.batteryLevel })
    : t("device.batteryUnknown"),
);

function onManageClick(): void {
  uni.navigateTo({
    url: `/pages/manage/manage?id=${encodeURIComponent(props.device.id)}`,
  });
}

async function onUnlockClick(): Promise<void> {
  if (busy.value) return;
  emit("requestUnlock", props.device);
}

/** 供父组件通过 ref 调用：用给定密码执行开锁 */
function performUnlock(password: string): void {
  void doUnlock(password);
}

defineExpose({ performUnlock });

async function doUnlock(password: string): Promise<void> {
  if (!/^\d{6}$/.test(password)) {
    emit("notify", t("status.passwordInvalid"), true);
    return;
  }
  busy.value = true;
  try {
    // 1) 确保连到目标设备（必要时断开当前连接并重连）
    const target = await ensureConnectedToDevice(props.device);
    const client = getBleClient();
    // 2) 下发开锁命令，时序参数取自设备设置
    const response = await client.open({
      password,
      openTimeMs: target.settings.openTimeMs,
      waitTimeMs: target.settings.waitTimeMs,
      closeTimeMs: target.settings.closeTimeMs,
      reverse: target.settings.reverse,
    });

    // 3) 回写最近开锁时间 + 电量
    upsertDevice({
      ...target,
      lastOpenedAt: Date.now(),
      ...(response.batteryLevel ? { batteryLevel: response.batteryLevel } : {}),
    });

    // 4) 通知父组件展示结果并刷新
    const msg = response.success
      ? t("status.unlockSuccess")
      : t("status.unlockFailed", { message: response.message });
    const suffix = response.batteryLevel
      ? ` · ${t("status.battery", { level: response.batteryLevel })}`
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
  gap: 12rpx;
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
