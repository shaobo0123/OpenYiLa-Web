<template>
  <view class="add">
    <view class="page-head">
      <text class="title">{{ t("device.addTitle") }}</text>
      <text class="hint">{{ t("device.addHint") }}</text>
    </view>

    <view class="form-card">
      <wd-cell-group border>
        <wd-cell :title="t('device.filter')">
          <wd-input :model-value="namePrefix" :placeholder="DEFAULT_DEVICE_NAME" clearable @update:model-value="onPrefixInput" />
        </wd-cell>
      </wd-cell-group>
      <wd-notice-bar v-if="message" :type="isError ? 'danger' : 'info'" :text="message" />

      <wd-button type="primary" size="large" block :loading="busy" :disabled="busy" @click="onSearch">
        {{ busy ? t("status.searching") : t("action.searchDevice") }}
      </wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { getBleClient } from "../../ble";
import { errorMessage } from "../../ble/helpers";
import {
  readSearchPrefix,
  saveSearchPrefix,
  upsertDevice,
  DEFAULT_DEVICE_NAME,
} from "../../state/devices";

const { t } = useI18n();

const namePrefix = ref(readSearchPrefix());
const busy = ref(false);
const message = ref("");
const isError = ref(false);

function onPrefixInput(v: string): void {
  namePrefix.value = v;
}

async function onSearch(): Promise<void> {
  const prefix = namePrefix.value.trim() || DEFAULT_DEVICE_NAME;
  saveSearchPrefix(prefix);

  busy.value = true;
  isError.value = false;
  message.value = t("status.searching");
  try {
    const client = getBleClient();
    const info = await client.connect({ namePrefix: prefix });
    upsertDevice({
      id: info.deviceId,
      name: info.deviceName,
      lastConnectedAt: Date.now(),
    });
    message.value = t("device.addedDone");
    isError.value = false;
    uni.showToast({ title: t("device.addedDone"), icon: "success" });
    setTimeout(() => {
      uni.navigateBack({ delta: 1 });
    }, 600);
  } catch (error) {
    message.value = errorMessage(error);
    isError.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<style lang="scss" scoped>
.add {
  min-height: 100vh;
  max-width: 860rpx;
  margin: 0 auto;
  padding: 48rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
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
}

.form-card {
  display: grid;
  gap: 24rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 18rpx 44rpx rgba(23, 61, 43, 0.08);
}
</style>
