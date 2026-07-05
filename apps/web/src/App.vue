<template>
  <slot />
</template>

<style lang="scss">
page {
  --wot-color-theme: #2e7d52;
  --wot-color-theme-light: #2e7d52;
  --wot-color-theme-dark: #24583f;
  --wot-success-color: #2e7d52;
  --wot-button-primary-bg-color: #2e7d52;
  --wot-button-primary-border-color: #2e7d52;

  min-height: 100%;
  background:
    linear-gradient(180deg, #eef7f1 0%, #f6faf7 42%, #eef2ef 100%);
  color: #202324;
}
</style>
