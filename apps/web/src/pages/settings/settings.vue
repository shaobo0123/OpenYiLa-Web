<template>
  <view>
    <PageNav :title="t('settings.title')" />
    <view class="settings">
      <view class="page-head">
        <text class="title">{{ t("settings.title") }}</text>
      </view>

      <view class="section-card">
        <wd-cell-group border>
          <wd-cell :title="t('locale.label')" :label="t('settings.languageHint')" />
        </wd-cell-group>

        <view class="language-list">
          <wd-button
            v-for="locale in LOCALES"
            :key="locale.value"
            type="primary"
            block
            :plain="currentLocale !== locale.value"
            @click="onLocaleSelect(locale.value)"
          >
            {{ locale.label }}
          </wd-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/** 全局设置页：目前仅包含语言切换。 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import PageNav from "../../components/PageNav.vue";
import { LOCALES, getLocale, setLocale, type Locale } from "../../i18n";

const { t } = useI18n();

const currentLocale = ref<Locale>(getLocale());

/** 选择某语言：切换 i18n 并持久化 */
function onLocaleSelect(locale: Locale): void {
  setLocale(locale);
  currentLocale.value = locale;
}
</script>

<style lang="scss" scoped>
.settings {
  min-height: 100vh;
  max-width: 860rpx;
  margin: 0 auto;
  padding: 48rpx 32rpx calc(64rpx + env(safe-area-inset-bottom));
}

.page-head {
  margin-bottom: 28rpx;
}

.title {
  color: #173d2b;
  font-size: 44rpx;
  font-weight: 800;
}

.section-card {
  display: grid;
  gap: 24rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 18rpx 44rpx rgba(23, 61, 43, 0.08);
}

.language-list {
  display: grid;
  gap: 20rpx;
}
</style>
