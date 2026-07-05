<template>
  <view class="panel">
    <view class="panel-head">
      <text class="panel-title">{{ t("admin.timingTitle") }}</text>
      <text class="panel-sub">{{ summary }}</text>
    </view>
    <wd-cell-group border>
      <wd-cell :title="t('field.openTime')">
        <wd-input
          :model-value="String(form.openTimeMs)"
          type="number"
          @update:model-value="(v: string) => update('openTimeMs', v)"
        />
      </wd-cell>
      <wd-cell :title="t('field.waitTime')">
        <wd-input
          :model-value="String(form.waitTimeMs)"
          type="number"
          @update:model-value="(v: string) => update('waitTimeMs', v)"
        />
      </wd-cell>
      <wd-cell :title="t('field.closeTime')">
        <wd-input
          :model-value="String(form.closeTimeMs)"
          type="number"
          @update:model-value="(v: string) => update('closeTimeMs', v)"
        />
      </wd-cell>
      <wd-cell :title="t('field.reverse')" :value="form.reverse ? t('admin.reverseOn') : t('admin.reverseOff')">
        <wd-switch :model-value="form.reverse" @update:model-value="onReverseChange" size="40rpx" />
      </wd-cell>
    </wd-cell-group>

    <wd-notice-bar v-if="message" :type="isError ? 'danger' : 'info'" :text="message" />

    <view class="panel-actions">
      <wd-button block @click="emit('reset')">{{ t("action.reset") }}</wd-button>
      <wd-button type="primary" block :loading="busy" :disabled="busy" @click="emit('save', { ...form })">
        {{ t("action.save") }}
      </wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Settings } from "../state/devices";

const { t } = useI18n();

const props = defineProps<{
  settings: Settings;
  busy?: boolean;
  message?: string;
  isError?: boolean;
}>();

const emit = defineEmits<{
  save: [settings: Settings];
  reset: [];
}>();

const form = reactive<Settings>({ ...props.settings });

const summary = computed(() => {
  const s = form;
  const dir = s.reverse ? t("admin.reverseOn") : t("admin.reverseOff");
  return `${s.openTimeMs}/${s.waitTimeMs}/${s.closeTimeMs}ms · ${dir}`;
});

function update(field: "openTimeMs" | "waitTimeMs" | "closeTimeMs", v: string): void {
  const num = Number(v);
  if (Number.isFinite(num)) {
    form[field] = Math.min(10000, Math.max(0, Math.round(num)));
  }
}

function onReverseChange(v: boolean | string | number): void {
  form.reverse = Boolean(v);
}
</script>

<style lang="scss" scoped>
.panel {
  display: grid;
  gap: 22rpx;
}

.panel-head {
  display: grid;
  gap: 6rpx;
}

.panel-title {
  color: #173d2b;
  font-size: 30rpx;
  font-weight: 800;
}

.panel-sub {
  color: #6c7871;
  font-size: 24rpx;
}

.panel-actions {
  display: flex;
  gap: 16rpx;
}
</style>
