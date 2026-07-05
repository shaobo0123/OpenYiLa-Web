<template>
  <wd-popup
    :model-value="visible"
    position="bottom"
    :close-on-click-modal="true"
    custom-class="unlock-sheet"
    @update:model-value="onVisibleChange"
  >
    <view class="sheet">
      <wd-cell-group :title="deviceName" :value="meta" border>
        <wd-cell :title="t('field.password')">
          <wd-input
            :model-value="password"
            type="number"
            :maxlength="6"
            :placeholder="t('field.password')"
            show-password
            @update:model-value="onInput"
          />
        </wd-cell>
      </wd-cell-group>

      <wd-notice-bar v-if="message" :type="isError ? 'danger' : 'info'" :text="message" />

      <view class="sheet-actions">
        <wd-button block @click="emit('close')">{{ t("action.cancel") }}</wd-button>
        <wd-button
          type="primary"
          block
          :loading="busy"
          :disabled="busy || password.length !== 6"
          @click="onConfirm"
        >
          {{ busy ? (busyLabel || t("status.opening")) : t("action.open") }}
        </wd-button>
      </view>
    </view>
  </wd-popup>
</template>

<script setup lang="ts">
/**
 * 开锁密码输入弹层（底部 popup）。
 * 每次打开会清空密码；密码满 6 位才允许确认。
 */
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
  deviceName: string;
  meta?: string;
  busy?: boolean;
  busyLabel?: string;
  message?: string;
  isError?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [password: string];
}>();

const password = ref("");

// 弹层每次显示时清空密码，避免残留上一次输入
watch(
  () => props.visible,
  (v) => {
    if (v) password.value = "";
  },
);

function onVisibleChange(v: boolean): void {
  if (!v) emit("close");
}

function onInput(v: string): void {
  password.value = v;
}

function onConfirm(): void {
  if (password.value.length !== 6) return;
  emit("confirm", password.value);
}
</script>

<style lang="scss" scoped>
.sheet {
  display: grid;
  gap: 20rpx;
  padding: 32rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
}

.sheet-actions {
  display: flex;
  gap: 16rpx;
}
</style>
