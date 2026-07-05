# OpenYiLa Web

OpenYiLa Web 是一个基于 uni-app / Vue 3 的 YiLa 蓝牙门锁控制项目。项目包含协议核心包和 Web/小程序前端，可用于连接设备、开门、管理设备参数和修改设备密码。

## 项目结构

```text
packages/core   协议核心，负责指令生成和响应解析
apps/web        前端应用，支持 H5 和微信小程序构建
docs            硬件接口和协议文档
```

## 环境要求

- Node.js 24 或兼容版本
- npm

## 安装依赖

```bash
npm install
```

安装后会自动把小程序构建需要的组件库链接到 `apps/web/node_modules`，用于避免 uni-app 在 workspace 下生成错误的依赖路径。

## 本地开发

```bash
npm run dev
```

启动后按终端提示访问本地地址。浏览器连接蓝牙时建议使用 `localhost` 或 HTTPS 环境。

## 构建

构建 H5：

```bash
npm run build
```

构建微信小程序：

```bash
npm run build:mp-weixin
```

构建 App：

```bash
npm run build:app
```

## 测试

```bash
npm test
```

## 更多说明

- 使用说明见 [操作说明.md](操作说明.md)
- 硬件接口见 [docs/硬件接口文档.md](docs/硬件接口文档.md)
