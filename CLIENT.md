# 番组课表多平台客户端开发说明

客户端使用 Tauri 2 封装现有 React + TypeScript 界面，一套代码构建 Windows、macOS 和 Android。日、周、月课表、筛选、追番进度、数据备份和 Bangumi 个人令牌同步沿用网页版本。

## 本地运行

需要 Node.js 20.19+、Rust 1.77.2+ 和平台编译工具：macOS 安装 Xcode Command Line Tools，Windows 安装 Microsoft C++ Build Tools 与 WebView2。

```bash
npm install
npm run desktop
```

只验证网页界面：

```bash
npm run dev
```

生成当前平台的安装包：

```bash
npm run desktop:build
```

macOS 安装包必须在 macOS 构建，Windows 安装包必须在 Windows 构建。以后可以用 GitHub Actions 分别启动 macOS 与 Windows 云端构建机，自动产出 `.dmg`、`.msi` 或 `.exe`。

## Android

安装 Android Studio，并通过 SDK Manager 安装 Android SDK Platform、Platform-Tools、Build-Tools、Command-line Tools 和 NDK。配置 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME` 后执行：

```bash
npm run android:init
npm run android
```

生成 APK/AAB：

```bash
npm run android:build
```

Android 与桌面端共用数据和业务代码。手机窄屏默认进入日视图，详情与设置使用弹窗；周视图仍保留完整七列，可横向滑动查看。

## 放送数据更新

客户端运行时直接读取 Bangumi 官方 API 与 bangumi-data；`public/data/enhance.json` 提供停播、提前播出和逐集时间等校正。原生客户端每 12 小时从公开的 [`MASUKA2018/Bangumi_ClassTimeTable`](https://github.com/MASUKA2018/Bangumi_ClassTimeTable) 数据仓库检查最新校正，失败时回退到上次成功缓存或安装包内置数据。

`BGM_WIKI_TOKEN` 只配置在公开数据仓库的 GitHub Actions Secrets 中。私有客户端仓库不保存该 Token，也不运行数据同步和网页部署工作流。公开数据仓库每天 `22:20 UTC` 自动更新，即北京时间次日 06:20、日本时间次日 07:20。

默认数据地址已经写入客户端源码。需要切换到其他公开数据源时，可以复制 `.env.example` 为 `.env.production.local`，修改地址后重新构建安装包：

```bash
cp .env.example .env.production.local
npm run desktop:build
```

`.env.production.local` 已被 `*.local` 规则忽略，不会提交；这里保存的只是公开数据地址，不是 Token。未配置 `VITE_ENHANCE_URL` 时，客户端读取 MASUKA2018 的公开数据仓库。

## 当前客户端差异

- 外部链接由系统默认浏览器打开。
- 远端 API 请求通过 Tauri HTTP 插件发出，并限制到项目实际使用的域名。
- PWA Service Worker 在桌面版中关闭，由应用安装包管理静态资源。
- 网页 OAuth 回调依赖 `https://bgmtimetable.com/`，桌面版暂时隐藏一键登录；Bangumi 个人令牌登录可以正常使用。
