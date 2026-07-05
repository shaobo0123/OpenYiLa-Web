<template>
  <view class="empty">
    <view class="empty-mark">
      <wd-icon name="bluetooth" size="72rpx" color="#2e7d52" />
    </view>
    <text class="empty-title">{{ t("device.empty") }}</text>
    <text class="empty-hint">{{ t("device.emptyHint") }}</text>
    <wd-button type="primary" size="large" block @click="emit('add')">
      {{ t("action.addDevice") }}
    </wd-button>
  </view>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const emit = defineEmits<{ add: [] }>();
</script>

<style lang="scss" scoped>
.empty {
  display: grid;
  justify-items: center;
  gap: 20rpx;
  margin-top: 64rpx;
  padding: 64rpx 44rpx;
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.72);
  text-align: center;
}

.empty-mark {
  display: grid;
  place-items: center;
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
  background: #edf7f1;
}

.empty-title {
  color: #173d2b;
  font-size: 34rpx;
  font-weight: 800;
}

.empty-hint {
  color: #6c7871;
  font-size: 26rpx;
  line-height: 1.5;
}
</style>
