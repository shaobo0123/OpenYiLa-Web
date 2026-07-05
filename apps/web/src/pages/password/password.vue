<template>
  <view>
    <PageNav :title="t('admin.passwordTitle')" />
    <view class="password">
      <view v-if="device" class="page-head">
        <text class="title">{{ t("admin.passwordTitle") }}</text>
        <text class="hint">{{ device.name }}</text>
      </view>

      <view v-if="device" class="section-card">
        <PasswordPanel
          ref="passwordPanelRef"
          :busy="busy"
          :busy-label="t('status.changingPassword')"
          :message="message"
          :is-error="isError"
          @submit="onChangePassword"
        />
      </view>

      <wd-status-tip v-else image="content" :tip="t('admin.noDevice')" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 修改密码页：校验表单后，连接设备并下发改密命令。
 * 改密成功会清空表单并返回上一页。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { onLoad } from "@dcloudio/uni-app";
import PageNav from "../../components/PageNav.vue";
import PasswordPanel from "../../components/PasswordPanel.vue";
import { getBleClient } from "../../ble";
import { errorMessage, withDeviceConnection } from "../../ble/helpers";
import { findDevice, upsertDevice, type DeviceRecord } from "../../state/devices";
import { tt } from "../../i18n";

const { t } = useI18n();

const deviceId = ref("");
const device = ref<DeviceRecord | null>(null);
const busy = ref(false);
const message = ref("");
const isError = ref(false);
// 用于改密成功后清空表单
const passwordPanelRef = ref<InstanceType<typeof PasswordPanel> | null>(null);

onLoad((query) => {
  deviceId.value = readRouteDeviceId(query);
  device.value = deviceId.value ? findDevice(deviceId.value) : null;
});

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

async function onChangePassword(form: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  if (!device.value) return;
  // 前置校验：6 位数字 + 两次新密码一致
  if (!/^\d{6}$/.test(form.oldPassword) || !/^\d{6}$/.test(form.newPassword)) {
    message.value = t("status.passwordInvalid");
    isError.value = true;
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    message.value = t("status.passwordMismatch");
    isError.value = true;
    return;
  }

  busy.value = true;
  isError.value = false;
  try {
    // 按需连接：连上 → 下发改密命令 → 自动断开
    const response = await withDeviceConnection(device.value!, async () => {
      return getBleClient().changePassword({
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      });
    });

    // 改密成功：把新密码同步写回设备记录，保证一键开锁自动用新密码；
    // 同时顺带回写一下电量
    if (response.success) {
      device.value = upsertDevice({
        ...device.value!,
        password: form.newPassword,
        ...(response.batteryLevel ? { batteryLevel: response.batteryLevel } : {}),
      });
    } else if (response.batteryLevel) {
      device.value = upsertDevice({ ...device.value!, batteryLevel: response.batteryLevel });
    }

    message.value = response.success
      ? t("status.passwordChangeSuccess")
      : tt("status.passwordChangeFailed", { message: response.message });
    isError.value = !response.success;

    if (response.success) {
      passwordPanelRef.value?.reset();
      uni.showToast({ title: message.value, icon: "success" });
      setTimeout(() => {
        uni.navigateBack({ delta: 1 });
      }, 600);
    }
  } catch (error) {
    message.value = errorMessage(error);
    isError.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss" scoped>
.password {
  min-height: 100vh;
  max-width: 860rpx;
  margin: 0 auto;
  padding: 32rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
}

.page-head {
  margin-bottom: 28rpx;
}

.title,
.hint {
  display: block;
}

.title {
  color: #173d2b;
  font-size: 44rpx;
  font-weight: 800;
}

.hint {
  margin-top: 10rpx;
  color: #6c7871;
  font-size: 26rpx;
  word-break: break-all;
}

.section-card {
  padding: 28rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 18rpx 44rpx rgba(23, 61, 43, 0.08);
}
</style>
