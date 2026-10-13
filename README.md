# 番组课表 · Bangumi ClassTimetable

> **来源与二次开发声明**
>
> 本客户端基于 [Miint-Sunny/Bangumi_ClassTimeTable](https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)。原网页界面、课表与追番核心逻辑，以及本说明中沿用的基础功能描述来自原作者，**不是 MASUKA2018 从零原创开发的项目**。
>
> MASUKA2018 在原项目基础上开发和维护 Windows / macOS 桌面客户端，并增加下方单独列出的桌面功能。本说明由原作者 README 转载／整理内容与客户端新增说明组成；保留原作者署名及 [MIT 许可证](LICENSE)，不把上游已有成果算作本次客户端开发的原创功能。

**像课表一样追番。** bangumi.tv 当季新番的日 / 周 / 月三视图课表,带追番进度与
bgm 账号双向同步。

## 本仓库用途

本仓库统一维护公开的 Windows / macOS 客户端源码、每日放送数据、构建流程和 [GitHub Releases 安装包与更新清单](https://github.com/MASUKA2018/Bangumi_ClassTimeTable/releases)。源码以 MIT 许可证开放；构建方式见 [CLIENT.md](CLIENT.md)，密钥管理见 [SECURITY.md](SECURITY.md)。Android 适配代码保留，当前发布与验证以 Windows / macOS 为主。

2026-10-13 已合入原 [Bangumi_ClassTimeTable_Client](https://github.com/MASUKA2018/Bangumi_ClassTimeTable_Client) 的客户端源码及提交历史。后续开发、贡献和 [问题反馈](https://github.com/MASUKA2018/Bangumi_ClassTimeTable/issues) 集中在本仓库；旧客户端仓库仅作历史参考。

每日数据同步与程序构建独立运行：数据更新不会触发重新打包客户端。现有 `public/data/enhance.json`、Releases 和更新清单地址保持不变，旧版本客户端仍可读取数据和检查更新。签名私钥、服务令牌与用户账号数据不随源码发布。

**本仓库不发布网页版。** GitHub Pages 和 Cloudflare 网页部署任务已停用，保留 bgm.wiki 每日数据同步。原网页基础功能及客户端新增功能在下方分开说明。

**原项目网站（非 MASUKA2018 部署）：** [bgmtimetable.com](https://bgmtimetable.com/) · [原项目 Pages 镜像](https://miint-sunny.github.io/Bangumi_ClassTimeTable/)。

## Contributors · 贡献与致谢

| 贡献者 / 工具 | 实际分工 |
| --- | --- |
| [Miint-Sunny](https://github.com/Miint-Sunny) | 原始项目作者；提供网页界面、课表与追番核心逻辑、数据处理基础及原项目说明。 |
| [MASUKA2018](https://github.com/MASUKA2018) | 基于原项目的 Windows / macOS 客户端二次开发、需求制定、测试验收、数据与版本发布维护；不是原始网页版的原创作者。 |
| [github-actions[bot]](https://github.com/apps/github-actions) | 自动化执行每日放送数据同步、校验和数据提交；Git 历史已有实际提交记录。 |
| OpenAI ChatGPT / Codex（AI 辅助工具） | 按维护者需求辅助客户端功能实现、调试、测试、构建及文档整理；不作为独立的人类维护者或虚构 GitHub 账号。 |

**上游历史署名：** 原项目提交包含 Claude 的协作署名，例如 [CI 加固提交](https://github.com/Miint-Sunny/Bangumi_ClassTimeTable/commit/7b6c52ced8e1adfd1e8650f3bbdf1f536dcecf57)。这里保留该历史贡献记录，不将其列为本次桌面客户端新增功能的参与工具。

GitHub 侧栏的 Contributors 由提交记录自动统计，可能与这份分工说明不同；本表用于补充原作者、维护者、自动化机器人及 AI 辅助的实际作用，不修改历史作者信息。感谢 Bangumi、bangumi-data、bgm.wiki 与 yuc.wiki 的数据维护者；各数据来源的权利和署名仍归原维护者。

## 沿用原项目的基础功能

以下基础功能与相应描述主要来自原项目；客户端平台适配与新增功能在“桌面客户端新增与改进”中单独说明。

### 三个视图

- **周视图**:真·课表(行 = 时刻,列 = 星期),粉色当前时刻线横穿整周实时走动,
  表头与时间轴滚动吸附
- **日视图**:单日时间轴,「刚刚播出 / 接下来 24 小时」带倒计时;侧栏速览自动双栏
- **月视图**:日历上标出每天更新哪些番、第几集,已播自动变灰
- 时区一键切换(日本 ⇄ 本地,跨日自动落对格子);深夜表记边界可自定义
  (默认凌晨 2:00 前归前日,表记 24+ 小时制),"今天"的归属跟随深夜日界
- 翻页/切视图用 View Transitions 交叉淡化,视图区与侧栏独立快照,不闪不残影

### 追番与同步

- **Bangumi 账号双向同步**:OAuth 一键登录(或粘贴[个人令牌](https://next.bgm.tv/demo/access-token))
  ——应用内改状态/进度/评分/标签即时写回 bgm 收藏,bgm 侧改动定期拉取合并;
  首次连接双向合并(状态本机优先、进度取较大值),离线改动进队列断网不丢
- **bgm 式收藏面板**:十星评分(官方文案:不忍直视 ~ 超神作)、标签
  (常用/我的标签一键选)、吐槽、仅自己可见
- **进度即作业**:每格显示「看到 X / 已播 Y / 全 Z 集」,落后标红,
  顶栏汇总"欠了 N 集没看";补番清单一键 +1 / 补齐
- **好友进度**:填 bgm 用户名看好友(公开收藏)的进度;共同在追、好友动态
- 撞档提醒(⚡ 同时段两部在追)、个性化 ICS 日历导出、我的课表过滤、
  数据备份导入导出
- **跨季自动分级**:上季续播(半年番下半,金色垫底 + 续)与长期放送
  (年番/柯南们,季初已播 >20 集,冷色垫底 + 长期)自动区分
- **筛选面板**:范围(新番/续播/长期多选)· 产地(日本/中国/其他地区/未知,
  拿不准的诚实标未知、每日复查)· 口碑(按评分人数加权的分数下限)·
  改编来源 · 题材标签(均带当季数量),详情页点标签直接落入筛选;选择跨会话记住

### 数据可信

- **评分按人数加权**(IMDb 式贝叶斯收缩):三五个人打的 10.0 不再霸榜,
  小众好番也不被误伤;评分人数直接展示,不足 10 人的分数降调标注
- **放送校正(AirFix)**:先行整批放出、1~3 先行后周更等不规则放送精确建模,
  集数进度、三视图、ICS 全部感知;详情页内置校正编辑器,自己查证即改即生效,
  可一键复制 JSON 贡献回站点
- **每集精确时刻**:经 [番組維基 bgm.wiki](https://bgm.wiki) 开发者 API 每日
  CI 同步(自动清洗海外延迟档、校验通过直接上线),年番休播漂移、一举多话、
  先行世界首映都对得上;课表格位按近五周实播定位,不被季初首映带偏

### 其他

- 季度归档:顶栏切到任意历史季度(静态数据包,零 API 请求),2024Q4 起八季
- 界面四语言(简中 / 繁中 / 日本語 / EN),首访跟随浏览器语言;
  站内「关于」窗口含版本信息与更新历史
- 键盘快捷键:`←/→` 翻页,`Home` 回今天,`D/W/M` 切视图
- 右侧常驻面板:详情就地展开、可拖宽、拖到最窄收起;迷你月历点日期跳日视图
- 全站动效只动 transform/opacity(不卡顿),尊重"减弱动态效果";
  弹窗轻磨砂(Liquid Glass 式)

## 桌面客户端新增与改进

以下是基于原项目的二次开发，不属于上方转载的原网页功能说明：

- Windows 平台适配，与 macOS 共用业务和响应式布局代码，修正 Windows 滚动条及窗口拉伸问题。
- 十款主题与色板预览；Windows 11 标题栏同步主题，macOS 保留原生按钮并同步底色。配色参考官方 [Nord](https://www.nordtheme.com/docs/colors-and-palettes/)、[Dracula](https://draculatheme.com/spec)、[Catppuccin](https://catppuccin.com/palette/) 与 [Solarized](https://ethanschoonover.com/solarized/)。
- “在看”与“未在看”分组定时，封面富提醒、放送前／后提醒、仅想看范围与提醒快捷操作；可悬停暂停关闭或不自动关闭。
- 关闭／最小化到托盘，恢复主窗口，以及可选开机自动启动。
- 欠番集数明细与待看清单；今日、未来 24 小时、搁置分类，逐集标记及最近一次进度撤销。
- 0.4.1 修复跨设备观看进度：通过 Bangumi 章节状态接口写入并确认；支持进度回退／清零、持久离线重试，并防止旧缓存覆盖新进度。两台连接同一账号，启动／切回窗口／恢复联网时刷新，运行中每 5 分钟检查，不是实时推送。
- 与 Bangumi 同步的“搁置”状态，保留观看进度并停止相应提醒。
- 显示密度、100/115/130% 字体、三种封面大小与实时跟随系统主题。
- 最近 7 天自动备份、3 份恢复／升级前快照；预览后合并／覆盖恢复，恢复后暂停云端同步，备份不含令牌。
- 程序与数据独立更新；客户端源码在本仓库公开，安装包、更新签名和清单在本仓库 Releases 发布，用户确认后才安装程序更新。公开的更新公钥用于校验，签名私钥与服务令牌不随源码发布。

## 反馈

客户端新增功能的问题请通过 [本仓库 Issues](https://github.com/MASUKA2018/Bangumi_ClassTimeTable/issues) 反馈。原项目的问题可向 [上游 Issues](https://github.com/Miint-Sunny/Bangumi_ClassTimeTable/issues) 反馈，不代表原作者维护本客户端的二次开发。

用得不顺、数据不对、想要新功能 →
[**提一个客户端 Issue**](https://github.com/MASUKA2018/Bangumi_ClassTimeTable/issues/new)。
站内「设置 → 反馈问题」也能直达。放送时间错误可先用详情页的校正编辑器自查自纠,
把生成的 JSON 贴进 Issue 就是一份完整的修正报告。

## 数据来源与流量原则

| 来源 | 用途 | 方式 |
| --- | --- | --- |
| Bangumi 官方 API `/calendar` | 每周放送骨架、评分、封面 | 前端直连,响应裁剪后缓存 6h |
| bangumi-data 数据集 | 精确放送时刻、周期、播放平台 | jsDelivr CDN,缓存 24h |
| Bangumi API `/v0/subjects` | 集数、简介、热门标签 | 按需懒加载,缓存 7 天 |
| Bangumi API `/v0/users/*/collections` | 好友公开进度 | 缓存 1h |
| Bangumi API 收藏与章节读写(仅登录后) | 自己的追番与观看进度双向同步 | Bearer 认证;写回逐条慢速，个人进度缓存 1 分钟；运行中每 5 分钟及恢复窗口／联网时刷新 |
| [番組維基 bgm.wiki](https://bgm.wiki)(每集精确时刻) | `enhance.json` 的 `air.epDates` | 经其**开发者 API**(token 认证)每日 CI 同步,数据由其编辑者社区维护,特此致谢 |
| yuc.wiki(可选增强:标签/PV/改编来源) | `public/data/enhance.json` | **不自动抓取**,由 `/refresh-data` skill 人工触发,页面由人手动保存 |

所有远端响应均本地缓存,正常使用一天只产生个位数 API 请求。
**不写、不跑任何针对 yuc.wiki 或 bgm.tv 网页的定时/批量爬虫。**

## 网页部署已停用

`refresh-data.yml` 现在只执行数据拉取、校验和提交，不再派发任何网页部署。安装包、更新签名、`latest.json`、现有数据及同步密钥不受影响。

原项目的网页 OAuth 和 Cloudflare 部署代码保留为上游参考，见 [worker/README.md](worker/README.md)。其中的域名与部署示例属于原项目，并非本客户端的发布配置；自行部署应先更换自己的域名与 OAuth 配置，不要直接使用原作者域名。

## 开发

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 产物在 dist/,纯静态
```

换季:前端数据自动跟随当季;yuc 增强数据在 Claude Code 里运行
`/refresh-data` 按提示操作。归档已结束的季度:

```bash
python3 scripts/bake_season.py 202607   # 可一次传多个 YYYYMM
```

## 路线图

- [ ] 换季对比(上季 vs 本季追番回顾)
- [x] 「搁置」状态与 Bangumi 同步、保留进度且停止提醒

## 协议

[MIT](LICENSE) · 数据归各来源所有,致谢 Bangumi、bangumi-data、番組維基与
yuc.wiki 的维护者们。
