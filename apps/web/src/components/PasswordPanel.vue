<template>
  <view class="panel">
    <text class="panel-title">{{ t("admin.passwordTitle") }}</text>
    <wd-cell-group border>
      <wd-cell :title="t('field.oldPassword')">
        <wd-input
          :model-value="form.oldPassword"
          type="number"
          :maxlength="6"
          show-password
          @update:model-value="(v: string) => update('oldPassword', v)"
        />
      </wd-cell>
      <wd-cell :title="t('field.newPassword')">
        <wd-input
          :model-value="form.newPassword"
          type="number"
          :maxlength="6"
          show-password
          @update:model-value="(v: string) => update('newPassword', v)"
        />
      </wd-cell>
      <wd-cell :title="t('field.confirmPassword')">
        <wd-input
          :model-value="form.confirmPassword"
          type="number"
          :maxlength="6"
          show-password
          @update:model-value="(v: string) => update('confirmPassword', v)"
        />
      </wd-cell>
    </wd-cell-group>

    <wd-notice-bar v-if="message" :type="isError ? 'danger' : 'info'" :text="message" />

    <wd-button
      type="primary"
      block
      :loading="busy"
      :disabled="busy || !ready"
      @click="emit('submit', { ...form })"
    >
      {{ busy ? (busyLabel || t("status.changingPassword")) : t("action.confirmChangePassword") }}
    </wd-button>
  </view>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  busy?: boolean;
  busyLabel?: string;
  message?: string;
  isError?: boolean;
}>();

const emit = defineEmits<{
  submit: [form: { oldPassword: string; newPassword: string; confirmPassword: string }];
}>();

const form = reactive({
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const ready = computed(
  () =>
    /^\d{6}$/.test(form.oldPassword) &&
    /^\d{6}$/.test(form.newPassword) &&
    form.newPassword === form.confirmPassword,
);

function update(field: "oldPassword" | "newPassword" | "confirmPassword", v: string): void {
  form[field] = v;
}

defineExpose({
  reset() {
    form.oldPassword = "";
    form.newPassword = "";
    form.confirmPassword = "";
  },
});
</script>

<style lang="scss" scoped>
.panel {
  display: grid;
  gap: 20rpx;
}

.panel-title {
  color: #173d2b;
  font-size: 30rpx;
  font-weight: 800;
}
</style>
