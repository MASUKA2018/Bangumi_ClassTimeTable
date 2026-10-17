# 番组课表多平台客户端开发说明

客户端使用 Tauri 2 封装现有 React + TypeScript 界面，一套代码构建 Windows、macOS 和 Android。日、周、月课表、筛选、追番进度、数据备份和 Bangumi 个人令牌同步沿用网页版本。2026-10-13 起源码、每日放送数据及版本发布统一维护在 `MASUKA2018/Bangumi_ClassTimeTable`；原 `_Client` 仓库只作历史参考。

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

macOS 应用必须在 macOS 构建，Windows 安装包必须在 Windows 构建。仓库的 `Windows Client` 和 `macOS Client` GitHub Actions 会在 `main` 的程序相关变更、相关 Pull Request 和手动触发时分别验证两个桌面平台；产物可在对应 Actions run 的 Artifacts 区下载。仅修改 `public/data/**` 的每日同步不会触发这两个构建，后续程序构建仍会打包当时最新的内置数据。

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

### 0.4.2 上传后立即同步的回退保护

两台都升级到 0.4.2。在看／搁置番剧无论收藏列表汇总为正数、0 还是缺失，都直接读取章节状态；汇总滞后不再将已确认的观看进度覆盖为 0。个人请求跳过 WebView HTTP 缓存，原生端也向代理发送不使用缓存的指令。

章节上传确认后额外保存账号隔离的核对凭据，直到后续完整拉取与上传结果一致；重启后仍生效。较新的云端修改可覆盖较早凭据，因此并非永远取较大进度，仍支持另一台主动回退／清零。个别番剧读取失败或核对不一致时保留本机记录，其他番剧可正常刷新；此时明确显示部分失败和原因，完整成功则显示上传条数与已直接核对的观看进度数量。遗留的防抖上传定时器不会再用空队列成功提示覆盖同步错误。

这些回归场景使用模拟服务验证，没有擅自修改真实账号。新版不会猜测恢复已经被旧版覆盖的历史进度；如需找回，请在“备份与恢复”预览已有快照，确认后再恢复，勿清空客户端数据。

### 0.4.1 跨设备观看进度修复

两台设备都升级到 0.4.1 并连接同一个 Bangumi 账号后，可同步观看进度，Windows / macOS 互通。动画观看进度通过 `/v0/users/-/collections/{subject_id}/episodes` 更新章节状态，不再把书籍专用的 `ep_status` 写入动画收藏接口；写入后读取章节状态确认结果。

“看到第 N 集”对应本篇第 1–N 集已看，SP、OP、ED 不会被顺带标记或清除。普通进度增加不会倒退另一台设备已经更高的云端进度；手动降低进度或清零才会清除后续本篇已看标记。未收录目标章节时保留本机改动等待重试，不假报上传成功。

启动、切回窗口和恢复联网时刷新，运行中每 5 分钟检查；这不是实时推送。个人收藏缓存缩短为 1 分钟，自动刷新与手动“立即同步”均跳过旧缓存，写入成功即清除本机旧快照。网络失败时保留队列并退避重试，不再重试 5 次后丢弃；上传中产生的新改动也不会被旧请求删除。首次升级会一次性补传本机较大的历史进度，保留云端状态且不自动降低云端进度。

修复测试使用模拟 Bangumi 服务，不擅自改动真实账号收藏。已连接账号的主题、提醒时间等设置仍只保存在各自设备，不随观看进度同步。

### 其他 0.4 功能

- 更新中心把程序版本与放送数据分开：数据可立即刷新并保留失败前的数据；程序默认在启动后检查（一天至多一次成功检查），发现新版后需用户确认安装，不会自动安装。
- 客户端源码在本仓库以 MIT 许可证公开；本仓库 Releases 发布平台安装包、`.sig` 和 `latest.json`，原有下载和更新地址不变。更新器仅接受配置的 HTTPS 地址与内置公钥验证的文件。发布清单只能登记已实际构建并签名的平台；macOS 须在 Mac 上构建签名包，不能用 Windows 安装包代替。
- 签名构建必须设置环境变量 `TAURI_SIGNING_PRIVATE_KEY`（可为仓库外私钥的完整路径）及可选 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，不要将私钥写入源码、日志或提交 Git。公钥在 `tauri.conf.json` 中。签名私钥丢失将无法继续为已有安装版本发布可信更新，请离线安全备份。
- CI 未配置签名 Secrets 时使用 `--config src-tauri/tauri.unsigned.conf.json` 生成普通安装包；它不能充当自动更新包。构建产物只上传 Actions Artifacts，不会自动覆盖 Releases 或更新清单。
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

`BGM_WIKI_TOKEN` 只配置在本仓库 GitHub Actions Secrets 中，仅供 `refresh-data.yml` 使用，不写入源码或客户端构建。该任务每天 `22:20 UTC` 自动更新，即北京时间次日 06:20、日本时间次日 07:20。Windows/macOS 构建与数据同步是独立工作流，网页部署保持停用。

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
