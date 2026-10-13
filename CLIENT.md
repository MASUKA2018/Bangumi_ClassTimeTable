# 番组课表多平台客户端开发说明

客户端使用 Tauri 2 封装现有 React + TypeScript 界面，一套代码构建 Windows、macOS 和 Android。日、周、月课表、筛选、追番进度、数据备份和 Bangumi 个人令牌同步沿用网页版本。

## 本地运行

需要 Node.js 20.19+、Rust 1.90+（含更新插件的最低要求）和平台编译工具：macOS 安装 Xcode Command Line Tools，Windows 安装 Microsoft C++ Build Tools 与 WebView2。

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

Windows 默认只生成面向当前用户安装的 NSIS `-setup.exe`，不生成 MSI；macOS 请显式使用 `--bundles app`。Windows 安装器内嵌约 1.8 MB 的 WebView2 bootstrapper；Windows 10/11 已有合适运行时便直接使用，否则安装器会补装。桌面端会保存窗口大小、位置和最大化状态，重复启动快捷方式会聚焦已有窗口。关闭或最小化主窗口会将应用收进系统托盘，左键托盘图标恢复窗口，右键菜单中的“退出”才会结束后台提醒。

设置页将番剧提醒拆为“在看”与“未在看”两组，可分别开关、设置不同时间并预览。Windows 和 macOS 原生端优先在主屏工作区右下角显示无边框主题卡片，包含封面、标题、当天放送时间和更新集数；多部番剧可在卡片内切换，两类同时出现会自动错开。提醒按当前选择的日本/本地时区和深夜日界计算，每组同一课表日只显示一次，窗口创建失败时回落到系统通知。macOS 使用主题匹配的不透明卡片底层，避免启用影响 Mac App Store 上架的私有透明窗口 API。

当前 beta 通过运行中的客户端计时，退出应用后不会在后台唤醒，到点前需保持客户端运行。提醒内容完全由已加载的公开课表数据在本机生成，不需要 Bangumi 账号，也不需要 `BGM_WIKI_TOKEN`。

macOS 应用必须在 macOS 构建，Windows 安装包必须在 Windows 构建。仓库的 `Windows Client` 和 `macOS Client` GitHub Actions 会在 `main`、Pull Request 和手动触发时分别验证两个桌面平台；产物可在对应 Actions run 的 Artifacts 区下载。

只在 macOS 上生成应用：

```bash
npm run desktop:build -- --bundles app
```

本地产物位于 `src-tauri/target/release/bundle/macos/`。当前 beta 只做临时签名，尚未配置 Apple Developer ID 签名和公证；正式对外分发前需要完成这两项配置。

只在 Windows 上生成 EXE 安装包：

```bash
npm run desktop:build -- --bundles nsis
```

本地产物位于 `src-tauri/target/release/bundle/nsis/`。更新校验签名与 Windows Authenticode 代码签名是两回事：当前 beta 未配置 Windows 代码签名，SmartScreen 仍可能显示“未知发布者”；正式发布前应配置受信任的代码签名证书，不要通过关闭 SmartScreen 规避提示。

## 0.4 更新、提醒与安全恢复

- 更新中心把程序版本与放送数据分开：数据可立即刷新并保留失败前的数据；程序默认在启动后检查（一天至多一次成功检查），发现新版后需用户确认安装，不会自动安装。
- 客户端源码在本仓库以 MIT 许可证公开；配套数据仓库 Releases 发布平台安装包、`.sig` 和 `latest.json`。更新器仅接受配置的 HTTPS 地址与内置公钥验证的文件。发布清单只能登记已实际构建并签名的平台；macOS 须在 Mac 上构建签名包，不能用 Windows 安装包代替。
- 签名构建必须设置环境变量 `TAURI_SIGNING_PRIVATE_KEY`（可为仓库外私钥的完整路径）及可选 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，不要将私钥写入源码、日志或提交 Git。公钥在 `tauri.conf.json` 中。签名私钥丢失将无法继续为已有安装版本发布可信更新，请离线安全备份。
- CI 未配置签名 Secrets 时使用 `--config src-tauri/tauri.unsigned.conf.json` 生成普通安装包；它不能充当自动更新包。CI 不会自动发布到公开仓库。
- 在看逐集提醒可设为放送前／后 0、5、10、15、30 分钟；只补发最近 5 分钟的错过提醒，避免启动时刷屏。提醒支持详情、10 分钟后再提醒、看到本集；放送前不允许标记本集。暂停、看过、抛弃不再提醒，未在看可仅提醒想看。
- 待看清单支持欠番、今日、未来 24 小时、搁置；进度采用“已连续看完前 N 集”，并提供最近一次操作的撤销。
- 每日备份在 Tauri 应用数据目录下的 `backups/`（Windows 默认 `%APPDATA%/com.bangumi.classtimetable/backups/`，Mac 默认 `~/Library/Application Support/com.bangumi.classtimetable/backups/`）；保留 7 天每日备份和 3 份恢复／更新前安全快照。关闭自动备份不会禁用操作前安全快照。
- 导入支持旧版备份，先预览差异再合并／覆盖。合并保留本机设置与状态，进度取较大值；覆盖使用备份。两种恢复都先保存快照并暂停云端同步，重启后仍暂停；用户确认“恢复同步”后才可能写回 Bangumi。所有备份均排除账号、令牌、API 缓存和同步队列。
- 显示设置提供紧凑／标准／大字、100/115/130% 字体、三种封面大小、实时跟随系统主题；共用布局，不针对单平台强改固定宽度。

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

`BGM_WIKI_TOKEN` 只配置在数据仓库的 GitHub Actions Secrets 中。客户端源码仓库不保存该 Token，也不运行数据同步和网页部署工作流。数据仓库每天 `22:20 UTC` 自动更新，即北京时间次日 06:20、日本时间次日 07:20。

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
