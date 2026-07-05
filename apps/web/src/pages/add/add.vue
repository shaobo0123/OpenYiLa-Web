<template>
  <view>
    <PageNav :title="t('device.addTitle')" />
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
  </view>
</template>

<script setup lang="ts">
/**
 * 添加设备页：输入设备名前缀，搜索并连接到第一台匹配的 YiLa 设备。
 * 连接成功后写入设备记录，提示后返回上一页。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import PageNav from "../../components/PageNav.vue";
import { getBleClient } from "../../ble";
import { errorMessage } from "../../ble/helpers";
import { DEFAULT_DISCONNECT_DELAY_MS } from "@openyila/core";
import {
  readSearchPrefix,
  saveSearchPrefix,
  upsertDevice,
  DEFAULT_DEVICE_NAME,
} from "../../state/devices";

const { t } = useI18n();

// 默认填充上次保存的搜索前缀
const namePrefix = ref(readSearchPrefix());
const busy = ref(false);
const message = ref("");
const isError = ref(false);

function onPrefixInput(v: string): void {
  namePrefix.value = v;
}

/** 触发搜索 + 连接：空前缀回退到默认设备名 */
async function onSearch(): Promise<void> {
  const prefix = namePrefix.value.trim() || DEFAULT_DEVICE_NAME;
  // 记住这次的前缀，作为下次默认值
  saveSearchPrefix(prefix);

  busy.value = true;
  isError.value = false;
  message.value = t("status.searching");
  const client = getBleClient();
  try {
    const info = await client.connect({ namePrefix: prefix });
    upsertDevice({
      id: info.deviceId,
      name: info.deviceName,
      lastConnectedAt: Date.now(),
    });
    // 添加只需确认是合法 YiLa 设备，连上即断开，不长期占用 GATT
    await client
      .disconnect({ delayMs: DEFAULT_DISCONNECT_DELAY_MS })
      .catch(() => {
        // 设备可能已自行断开，忽略
      });
    message.value = t("device.addedDone");
    isError.value = false;
    uni.showToast({ title: t("device.addedDone"), icon: "success" });
    // 短暂展示成功提示后返回首页
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
