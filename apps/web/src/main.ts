import { createSSRApp } from "vue";
import type { Plugin } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";

/**
 * uni-app 的应用入口。
 * uni-app 期望返回 { app } 由各端运行时挂载，所以用 createSSRApp。
 */
export function createApp() {
  const app = createSSRApp(App);
  app.use(i18n as unknown as Plugin);
  return {
    app,
  };
}
