<template>
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
</template>

<script setup lang="ts">
/**
 * 修改密码页：校验表单后，连接设备并下发改密命令。
 * 改密成功会清空表单并返回上一页。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { onLoad } from "@dcloudio/uni-app";
import PasswordPanel from "../../components/PasswordPanel.vue";
import { getBleClient } from "../../ble";
import { ensureConnectedToDevice, errorMessage } from "../../ble/helpers";
import { findDevice, upsertDevice, type DeviceRecord } from "../../state/devices";

const { t } = useI18n();

const deviceId = ref("");
const device = ref<DeviceRecord | null>(null);
const busy = ref(false);
const message = ref("");
const isError = ref(false);
// 用于改密成功后清空表单
const passwordPanelRef = ref<InstanceType<typeof PasswordPanel> | null>(null);

onLoad((query) => {
  deviceId.value = (query?.id as string) || "";
  device.value = deviceId.value ? findDevice(deviceId.value) : null;
});

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
    // 连接设备（必要时重连），再下发改密命令
    const target = await ensureConnectedToDevice(device.value);
    const response = await getBleClient().changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    });

    // 顺带回写一下电量
    if (response.batteryLevel) {
      device.value = upsertDevice({ ...target, batteryLevel: response.batteryLevel });
    }

    message.value = response.success
      ? t("status.passwordChangeSuccess")
      : t("status.passwordChangeFailed", { message: response.message });
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
