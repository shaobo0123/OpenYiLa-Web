<template>
  <view class="page-nav" :style="navStyle">
    <view class="nav-content">
      <wd-button
        v-if="showBack"
        type="text"
        size="small"
        icon="arrow-left"
        @click="goBack"
      />
      <view v-else class="nav-placeholder" />
      <text class="nav-title">{{ title }}</text>
      <view class="nav-placeholder" />
    </view>
  </view>
</template>

<script setup lang="ts">
/** 自绘导航栏：兼容微信小程序状态栏/胶囊按钮，也给 H5 保持同一套页面结构。 */
import { computed, onMounted, ref } from "vue";

withDefaults(
  defineProps<{
    title: string;
    showBack?: boolean;
  }>(),
  {
    showBack: true,
  },
);

const statusBarHeight = ref(0);
const navigationHeight = ref(52);

const navStyle = computed(() => ({
  height: `${statusBarHeight.value + navigationHeight.value}px`,
  paddingTop: `${statusBarHeight.value}px`,
}));

onMounted(() => {
  updateNavigationMetrics();
});

function updateNavigationMetrics(): void {
  // #ifdef MP-WEIXIN
  const wxUni = uni as unknown as {
    getMenuButtonBoundingClientRect?: () => { bottom: number; height: number };
    getWindowInfo?: () => { statusBarHeight?: number };
    getSystemInfoSync?: () => { statusBarHeight?: number };
  };
  const windowInfo = wxUni.getWindowInfo?.() ?? wxUni.getSystemInfoSync?.();
  const status = windowInfo?.statusBarHeight ?? 24;
  const menuButton = wxUni.getMenuButtonBoundingClientRect?.();

  statusBarHeight.value = status;
  navigationHeight.value = menuButton?.bottom
    ? Math.max(menuButton.bottom - status + 8, 44)
    : 48;
  // #endif
}

function goBack(): void {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 });
    return;
  }
  uni.reLaunch({ url: "/pages/home/home" });
}
</script>

<style lang="scss" scoped>
.page-nav {
  box-sizing: border-box;
  width: 100%;
}

.nav-content {
  display: grid;
  grid-template-columns: 88rpx minmax(0, 1fr) 88rpx;
  align-items: center;
  height: 100%;
  max-width: 860rpx;
  margin: 0 auto;
  padding: 0 24rpx;
  box-sizing: border-box;
}

.nav-title {
  color: #173d2b;
  font-size: 32rpx;
  font-weight: 800;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-placeholder {
  width: 88rpx;
  height: 1px;
}
</style>
