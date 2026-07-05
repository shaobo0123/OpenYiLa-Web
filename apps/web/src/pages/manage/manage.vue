<template>
  <view class="manage">
    <view v-if="device" class="summary">
      <view class="title-row">
        <view class="device-title">
          <text class="device-name">{{ device.name }}</text>
          <view class="tag-row">
            <wd-tag :type="connected ? 'success' : 'default'" round>
              {{ connected ? t("device.connectedShort") : t("device.offlineShort") }}
            </wd-tag>
            <wd-tag round>{{ batteryText }}</wd-tag>
          </view>
        </view>
      </view>
    </view>

    <wd-status-tip v-else image="content" :tip="t('admin.noDevice')" />

    <view v-if="device" class="section-card">
      <TimingPanel
        :settings="device.settings"
        :busy="busyKind === 'save'"
        :message="timingMessage"
        :is-error="timingError"
        @save="onSaveTiming"
        @reset="onResetTiming"
      />
    </view>

    <view v-if="device" class="section-card">
      <wd-button block @click="goPassword">
        {{ t("action.changePassword") }}
      </wd-button>
    </view>

    <view v-if="device" class="section-card danger-card">
      <text class="section-title">{{ t("action.delete") }}</text>
      <wd-notice-bar v-if="deleteMessage" :type="deleteError ? 'danger' : 'info'" :text="deleteMessage" />
      <wd-button type="error" block :loading="busyKind === 'delete'" :disabled="busyKind === 'delete'" @click="onDelete">
        {{ t("action.delete") }}
      </wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 设备管理页：展示某台设备的概览，提供时序设置、改密入口和删除设备。
 * 设备 id 通过页面 query 传入。
 */
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { onLoad, onShow } from "@dcloudio/uni-app";
import TimingPanel from "../../components/TimingPanel.vue";
import { getBleClient } from "../../ble";
import { errorMessage, confirmDialog } from "../../ble/helpers";
import {
  findDevice,
  updateDeviceSettings,
  deleteDeviceRecord,
  DEFAULT_SETTINGS,
  type DeviceRecord,
  type Settings,
} from "../../state/devices";

const { t } = useI18n();

const deviceId = ref("");
const device = ref<DeviceRecord | null>(null);
const connected = ref(false);

// 当前正在进行的操作类型：'save' | 'delete' | null，用于按钮 loading 态
const busyKind = ref<"save" | "delete" | null>(null);

const timingMessage = ref("");
const timingError = ref(false);
const deleteMessage = ref("");
const deleteError = ref(false);

const batteryText = computed(() =>
  device.value?.batteryLevel
    ? t("status.battery", { level: device.value.batteryLevel })
    : t("device.batteryUnknown"),
);

onLoad((query) => {
  deviceId.value = (query?.id as string) || "";
  refresh();
});

onShow(() => {
  refresh();
});

/** 重新从本地存储读取当前设备记录与连接状态 */
function refresh(): void {
  device.value = deviceId.value ? findDevice(deviceId.value) : null;
  connected.value = getBleClient().connectedDeviceId === deviceId.value;
}

/** 保存新的时序设置到本地存储 */
async function onSaveTiming(settings: Settings): Promise<void> {
  if (!device.value) return;
  busyKind.value = "save";
  timingError.value = false;
  try {
    const updated = updateDeviceSettings(device.value.id, settings);
    if (!updated) {
      timingMessage.value = t("admin.noDevice");
      timingError.value = true;
      return;
    }
    timingMessage.value = t("admin.savedFor", { name: updated.name });
    device.value = updated;
    uni.showToast({ title: timingMessage.value, icon: "success" });
  } finally {
    busyKind.value = null;
  }
}

/** 恢复默认时序设置 */
function onResetTiming(): void {
  if (!device.value) return;
  const updated = updateDeviceSettings(device.value.id, DEFAULT_SETTINGS);
  if (updated) {
    timingMessage.value = t("admin.resetDoneFor", { name: updated.name });
    timingError.value = false;
    device.value = updated;
    uni.showToast({ title: timingMessage.value, icon: "success" });
  }
}

function goPassword(): void {
  if (!device.value) return;
  uni.navigateTo({
    url: `/pages/password/password?id=${encodeURIComponent(device.value.id)}`,
  });
}

/** 删除设备：二次确认后从本地存储移除，并返回上一页 */
async function onDelete(): Promise<void> {
  if (!device.value) return;
  const confirmed = await confirmDialog(t("device.deleteConfirm", { name: device.value.name }));
  if (!confirmed) return;

  busyKind.value = "delete";
  try {
    deleteDeviceRecord(device.value.id);
    deleteMessage.value = t("device.deleted", { name: device.value.name });
    deleteError.value = false;
    uni.showToast({ title: deleteMessage.value, icon: "success" });
    setTimeout(() => {
      uni.navigateBack({ delta: 1 });
    }, 600);
  } catch (error) {
    deleteMessage.value = errorMessage(error);
    deleteError.value = true;
  } finally {
    busyKind.value = null;
  }
}
</script>

<style lang="scss" scoped>
.manage {
  min-height: 100vh;
  max-width: 860rpx;
  margin: 0 auto;
  padding: 32rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
  display: grid;
  align-content: start;
  gap: 24rpx;
}

.summary,
.section-card {
  padding: 28rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 18rpx 44rpx rgba(23, 61, 43, 0.08);
}

.summary {
  padding-top: 34rpx;
  padding-bottom: 34rpx;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.device-title {
  min-width: 0;
}

.device-name {
  display: block;
  margin-bottom: 14rpx;
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

.danger-card {
  display: grid;
  gap: 20rpx;
}

.section-title {
  color: #8a1f1f;
  font-size: 30rpx;
  font-weight: 800;
}
</style>
