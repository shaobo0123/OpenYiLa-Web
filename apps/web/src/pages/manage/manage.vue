<template>
  <view>
    <PageNav :title="t('admin.currentSettings')" />
    <view class="manage">
      <view v-if="device" class="summary">
        <view class="title-row">
          <view class="device-title">
            <text class="device-name">{{ device.name }}</text>
            <view class="tag-row">
              <view class="status-dot" :class="connected ? 'status-dot--on' : 'status-dot--off'" />
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

      <view v-if="device" class="section-card password-card">
        <text class="section-title">{{ t("admin.openPasswordTitle") }}</text>
        <text class="section-hint">{{ t("admin.openPasswordHint") }}</text>
        <wd-cell-group border>
          <wd-cell :title="t('field.password')">
            <wd-input
              :model-value="passwordForm"
              type="number"
              :maxlength="6"
              show-password
              clearable
              @update:model-value="onPasswordInput"
            />
          </wd-cell>
        </wd-cell-group>
        <wd-notice-bar v-if="passwordMessage" :type="passwordError ? 'danger' : 'info'" :text="passwordMessage" />
        <wd-button type="primary" block :loading="busyKind === 'password'" :disabled="busyKind === 'password'" @click="onSavePassword">
          {{ t("action.save") }}
        </wd-button>
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
import PageNav from "../../components/PageNav.vue";
import TimingPanel from "../../components/TimingPanel.vue";
import { getBleClient } from "../../ble";
import { errorMessage, confirmDialog } from "../../ble/helpers";
import { tt } from "../../i18n";
import {
  findDevice,
  updateDeviceSettings,
  updateDevicePassword,
  deleteDeviceRecord,
  DEFAULT_SETTINGS,
  type DeviceRecord,
  type Settings,
} from "../../state/devices";

const { t } = useI18n();

const deviceId = ref("");
const device = ref<DeviceRecord | null>(null);
const connected = ref(false);

// 当前正在进行的操作类型：'save' | 'password' | 'delete' | null，用于按钮 loading 态
const busyKind = ref<"save" | "password" | "delete" | null>(null);

const timingMessage = ref("");
const timingError = ref(false);
const deleteMessage = ref("");
const deleteError = ref(false);

// 开锁密码表单（本地存储，开锁时下发用）
const passwordForm = ref("");
const passwordMessage = ref("");
const passwordError = ref(false);

const batteryText = computed(() =>
  device.value?.batteryLevel
    ? tt("status.battery", { level: device.value.batteryLevel })
    : t("device.batteryUnknown"),
);

onLoad((query) => {
  deviceId.value = readRouteDeviceId(query);
  refresh();
});

onShow(() => {
  refresh();
});

/** 重新从本地存储读取当前设备记录与连接状态 */
function refresh(): void {
  device.value = deviceId.value ? findDevice(deviceId.value) : null;
  connected.value = getBleClient().connectedDeviceId === deviceId.value;
  // 同步密码表单为当前设备记录里的密码
  passwordForm.value = device.value?.password ?? "";
}

function readRouteDeviceId(query: Record<string, unknown> | undefined): string {
  const raw = query?.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
    timingMessage.value = tt("admin.savedFor", { name: updated.name });
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
    timingMessage.value = tt("admin.resetDoneFor", { name: updated.name });
    timingError.value = false;
    device.value = updated;
    uni.showToast({ title: timingMessage.value, icon: "success" });
  }
}

function onPasswordInput(v: string): void {
  passwordForm.value = v;
}

/** 保存开锁密码到本地（开锁时下发用，不写设备固件） */
function onSavePassword(): void {
  if (!device.value) return;
  if (!/^\d{6}$/.test(passwordForm.value)) {
    passwordMessage.value = t("status.passwordInvalid");
    passwordError.value = true;
    return;
  }
  busyKind.value = "password";
  try {
    const updated = updateDevicePassword(device.value.id, passwordForm.value);
    if (!updated) {
      passwordMessage.value = t("admin.noDevice");
      passwordError.value = true;
      return;
    }
    passwordMessage.value = tt("admin.savedFor", { name: updated.name });
    passwordError.value = false;
    device.value = updated;
    uni.showToast({ title: passwordMessage.value, icon: "success" });
  } finally {
    busyKind.value = null;
  }
}

function goPassword(): void {
  if (!device.value) return;
  uni.navigateTo({
    url: `/pages/password/password?id=${encodeURIComponent(device.value.id)}`,
  });
}

/** 删除设备：二次确认后断开 BLE、从本地存储移除，并返回上一页 */
async function onDelete(): Promise<void> {
  if (!device.value) return;
  const confirmed = await confirmDialog(tt("device.deleteConfirm", { name: device.value.name }));
  if (!confirmed) return;

  busyKind.value = "delete";
  try {
    // 先把蓝牙断开：单例客户端若仍连着这台设备，会导致后续无法重新添加
    // （小程序端 createBLEConnection 对已连接的 deviceId 会直接报错）
    const client = getBleClient();
    if (client.connectedDeviceId === device.value.id) {
      await client.disconnect().catch(() => {
        // 设备可能已自行断开，忽略
      });
    }
    deleteDeviceRecord(device.value.id);
    const message = tt("device.deleted", { name: device.value.name });
    deleteMessage.value = message;
    deleteError.value = false;
    uni.showToast({ title: message, icon: "success" });
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

.password-card {
  display: grid;
  gap: 20rpx;
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

.danger-card {
  display: grid;
  gap: 20rpx;
}

.section-title {
  color: #173d2b;
  font-size: 30rpx;
  font-weight: 800;
}

.section-hint {
  margin-top: -8rpx;
  color: #6c7871;
  font-size: 24rpx;
  line-height: 1.4;
}

/* 删除卡里的标题单独用红色警示 */
.danger-card .section-title {
  color: #8a1f1f;
}
</style>
