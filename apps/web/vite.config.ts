import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// uni-app 的 Vite 配置：注入 uni 插件，并关闭 sass 依赖告警
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  css: {
    preprocessorOptions: {
      scss: {
        // wot-design-uni 仍使用部分旧语法，静默这些弃用告警以免构建噪音
        quietDeps: true,
        silenceDeprecations: ["legacy-js-api", "import", "global-builtin", "if-function"],
      },
    },
  },
});
