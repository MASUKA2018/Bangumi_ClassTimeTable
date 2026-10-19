import { useEffect } from 'react'
import { getLang, t, type Lang } from '../lib/i18n'

const REPO = 'https://github.com/MASUKA2018/Bangumi_ClassTimeTable'
const UPSTREAM_REPO = 'https://github.com/Miint-Sunny/Bangumi_ClassTimeTable'

/** 更新历史:面向用户的里程碑(按 commit 提炼),每条自带四语言 */
interface LogEntry {
  d: string // YYYY-MM-DD
  x: Record<Lang, string>
}

const CHANGELOG: LogEntry[] = [
  {
    d: '2026-10-19',
    x: {
      'zh-Hans': '桌面端 beta 0.5.0：更新改用原生确认框并显示下载、签名校验、安装与重启阶段；新增逐部同步明细、单部重试与冲突选择、30 天进度历史及单部恢复、单部提醒和免打扰、可预览的脱敏诊断、托盘今日待看及下一集操作。旧 Mac 版首次升级可能需手动替换应用。',
      'zh-Hant': '桌面端 beta 0.5.0：更新改用原生確認框並顯示下載、簽章驗證、安裝與重新啟動階段；新增逐部同步明細、單部重試與衝突選擇、30 天進度歷史及單部復原、單部提醒和免打擾、可預覽的去識別診斷、系統匣今日待看及下一集操作。舊 Mac 版首次升級可能需手動替換應用程式。',
      ja: 'デスクトップ beta 0.5.0：ネイティブ確認ダイアログと更新段階の表示、作品別同期・再試行・競合解決、30日分の進捗履歴と作品別復元、個別通知と休止時間、プレビュー付き匿名化診断、トレイの今日の視聴と次話操作を追加。旧Mac版からは手動置換が必要な場合があります。',
      en: 'Desktop beta 0.5.0: native confirmation and update stages; per-show sync, retry and conflict resolution; 30-day progress history and single-show restore; per-show reminders and quiet hours; previewable redacted diagnostics; and today’s tray watch list with next-episode actions. Older Mac versions may require one manual replacement.',
    },
  },
  {
    d: '2026-10-17',
    x: {
      'zh-Hans': '桌面端 beta 0.4.2：修复上传后立刻同步时观看集数回退的问题。在看／搁置始终读取章节状态，不再相信滞后的收藏汇总；保存上传核对记录并跳过个人 HTTP 缓存。部分失败保留本机进度并明确提示，成功时显示上传与核对数量。',
      'zh-Hant': '桌面端 beta 0.4.2：修復上傳後立即同步時觀看集數倒退。在看／擱置一律讀取章節狀態，不再依賴落後的收藏彙總；保存上傳核對記錄並跳過個人 HTTP 快取。部分失敗保留本機進度並明確提示，成功時顯示上傳與核對數量。',
      ja: 'デスクトップ beta 0.4.2：送信直後の同期で話数が戻る問題を修正。視聴中・保留は各話の状態を直接確認し、古い集計値を使いません。送信確認記録を保存して個人HTTPキャッシュを回避。部分失敗時は端末の進捗を保持し、送信・確認件数を表示。',
      en: 'Desktop beta 0.4.2: fixes progress rollback when syncing immediately after an upload. Watching/on-hold shows always read episode states instead of stale aggregates. Persists upload receipts, bypasses personal HTTP caches, preserves local progress on partial failures and reports uploaded/verified counts.',
    },
  },
  {
    d: '2026-10-13',
    x: {
      'zh-Hans': '桌面端 beta 0.4.1：修复跨设备观看集数上传，改用 Bangumi 章节状态接口并确认结果；旧缓存不再覆盖新进度，支持回退和清零，离线改动持续保留重试。启动、窗口恢复和恢复联网时刷新，运行中每 5 分钟同步。',
      'zh-Hant': '桌面端 beta 0.4.1：修復跨裝置觀看集數上傳，改用 Bangumi 章節狀態介面並確認結果；舊快取不再覆蓋新進度，支援回退和清零，離線改動持續保留重試。啟動、視窗恢復和恢復連線時更新，執行中每 5 分鐘同步。',
      ja: 'デスクトップ beta 0.4.1：話数進捗をBangumiの各話状態APIで送信し、結果を確認。古いキャッシュによる上書きを防ぎ、進捗の減少・リセットとオフライン再試行に対応。起動・復帰・再接続時および実行中5分ごとに同期。',
      en: 'Desktop beta 0.4.1: uploads watched progress through Bangumi episode states and verifies it; prevents stale cache rollback, supports decreases/reset and durable offline retries. Syncs at startup, foreground, reconnection and every 5 minutes while running.',
    },
  },
  {
    d: '2026-10-12',
    x: {
      'zh-Hans': '桌面端 beta 0.4.0:新增独立更新中心、放送前后提醒与快捷操作、待看清单及进度撤销、7 天自动备份与安全恢复、可同步的搁置状态、显示密度与字体封面调整及跟随系统主题',
      'zh-Hant': '桌面端 beta 0.4.0:新增獨立更新中心、放送前後提醒與快捷操作、待看清單及進度復原、7 天自動備份與安全還原、可同步的擱置狀態、顯示密度與字體封面調整及跟隨系統主題',
      ja: 'デスクトップ beta 0.4.0:更新センター、放送前後通知と操作ボタン、未視聴一覧と進捗の取り消し、7日分のバックアップと安全な復元、保留の同期、表示密度・文字・表紙サイズとOSテーマ連動を追加',
      en: 'Desktop beta 0.4.0: separate app/data updates, before/after-air reminders with actions, watch queue and progress undo, 7-day backups and safe restore, synced on-hold status, density/font/cover controls and live system themes',
    },
  },
  {
    d: '2026-10-11',
    x: {
      'zh-Hans': '桌面端 beta 0.3.8:更新安装包内置放送校正与逐集时间至 2026-10-11；保留 0.3.7 的欠番明细、主题色板与标题栏配色',
      'zh-Hant': '桌面端 beta 0.3.8:更新安裝包內建放送校正與逐集時間至 2026-10-11；保留 0.3.7 的未看集數明細、主題色板與標題列配色',
      ja: 'デスクトップ beta 0.3.8:内蔵の放送補正・話数別時刻を 2026-10-11 版に更新。0.3.7 の未視聴内訳・テーマ・タイトルバー配色を維持',
      en: 'Desktop beta 0.3.8: refreshes bundled broadcast corrections and episode times through 2026-10-11; retains 0.3.7 backlog details, theme previews and title-bar colors',
    },
  },
  {
    d: '2026-10-09',
    x: {
      'zh-Hans': '桌面端 beta 0.3.7:顶栏未看集数可展开番剧与集数明细；系统标题栏跟随主题，新增 Nord、Dracula、Catppuccin 与 Solarized 配色及色板预览',
      'zh-Hant': '桌面端 beta 0.3.7:頂欄未看集數可展開番劇與集數明細；系統標題列跟隨主題，新增 Nord、Dracula、Catppuccin 與 Solarized 配色及色板預覽',
      ja: 'デスクトップ beta 0.3.7:未視聴話数の作品別内訳を追加。タイトルバーをテーマに合わせ、Nord・Dracula・Catppuccin・Solarized と色見本を追加',
      en: 'Desktop beta 0.3.7: per-show unwatched episode details, native title-bar theme matching, and Nord, Dracula, Catppuccin and Solarized palettes with previews',
    },
  },
  {
    d: '2026-10-06',
    x: {
      'zh-Hans': '桌面端 beta 0.3.6:设置新增开机自动启动；系统登录后可静默进入托盘，按设定时间继续发送番剧提醒',
      'zh-Hant': '桌面端 beta 0.3.6:設定新增開機自動啟動；登入系統後可靜默進入系統匣，依設定時間繼續傳送番劇提醒',
      ja: 'デスクトップ beta 0.3.6:自動起動設定を追加。OSログイン後はバックグラウンドでトレイに常駐し、設定時刻に通知を継続',
      en: 'Desktop beta 0.3.6: adds launch-at-startup; after sign-in the app can start silently in the tray and keep scheduled reminders running',
    },
  },
  {
    d: '2026-09-24',
    x: {
      'zh-Hans': '桌面端 beta 0.3.5:修复 Windows 宽窗口仍被限制在 1440px、课表无谓出现横向滚动条的问题；窗口拉大时课表列距自动扩展，窄窗口自动收窄或改用弹窗侧栏',
      'zh-Hant': '桌面端 beta 0.3.5:修復 Windows 寬視窗仍被限制在 1440px、課表無謂出現橫向捲軸的問題；視窗拉大時課表欄距自動延展，窄視窗自動收窄或改用彈窗側欄',
      ja: 'デスクトップ beta 0.3.5:Windows の広いウィンドウでも 1440px に制限され横スクロールが出る問題を修正。拡大時は列間隔を自動調整し、狭い時はサイドバーを縮小またはモーダル表示',
      en: 'Desktop beta 0.3.5: removes the 1440px cap that caused needless horizontal scrolling on wide Windows layouts; timetable columns now expand with the window and the sidebar adapts on narrower sizes',
    },
  },
  {
    d: '2026-09-20',
    x: {
      'zh-Hans': '桌面端 beta 0.3.4:提醒窗口调整为原尺寸的 75%，封面、标题、时间、进度与切换按钮保持完整并等比缩放',
      'zh-Hant': '桌面端 beta 0.3.4:提醒視窗調整為原尺寸的 75%，封面、標題、時間、進度與切換按鈕保持完整並等比縮放',
      ja: 'デスクトップ beta 0.3.4:通知ウィンドウを元の 75% に調整。表紙・題名・時刻・進捗・切替ボタンはそのまま等比縮小',
      en: 'Desktop beta 0.3.4: resizes the reminder window to 75% while preserving and proportionally scaling all cover, title, time, progress, and navigation content',
    },
  },
  {
    d: '2026-09-20',
    x: {
      'zh-Hans': '桌面端 beta 0.3.3:修复 Windows 提醒卡片被窗口状态恢复与显示缩放影响、错误出现在屏幕中部的问题；现在始终按任务栏工作区定位到右下角',
      'zh-Hant': '桌面端 beta 0.3.3:修復 Windows 提醒卡片受視窗狀態還原與顯示縮放影響、錯誤出現在螢幕中部的問題；現在固定依工作列區域定位於右下角',
      ja: 'デスクトップ beta 0.3.3:Windows のウィンドウ状態復元と表示倍率により通知カードが画面中央に出る問題を修正。タスクバーを除く領域の右下に固定',
      en: 'Desktop beta 0.3.3: fixes Windows reminder cards appearing near the center because of restored window state and display scaling; cards now anchor to the work area bottom-right',
    },
  },
  {
    d: '2026-09-15',
    x: {
      'zh-Hans': '桌面端 beta 0.3.2:修复当季实时日历返回 HTTP 封面，导致安装版拦截图片并显示“番”字的问题；旧缓存也会自动转换为 HTTPS',
      'zh-Hant': '桌面端 beta 0.3.2:修復當季即時日曆返回 HTTP 封面，導致安裝版攔截圖片並顯示「番」字的問題；舊快取也會自動轉換為 HTTPS',
      ja: 'デスクトップ beta 0.3.2:今期のリアルタイム番組表が返す HTTP 表紙を HTTPS に変換。インストール版で「番」と表示される問題を修正し、旧キャッシュも自動変換',
      en: 'Desktop beta 0.3.2: upgrades current-season HTTP cover URLs to HTTPS so installed apps no longer replace them with placeholders; legacy cache entries are converted too',
    },
  },
  {
    d: '2026-09-14',
    x: {
      'zh-Hans': '桌面端 beta 0.3.1:移除封面补全的 40 部上限，优先补全在看/想看并限速补齐全部课表；封面加载失败时显示占位符',
      'zh-Hant': '桌面端 beta 0.3.1:移除封面補全的 40 部上限，優先補全在看/想看並限速補齊全部課表；封面載入失敗時顯示預留圖',
      ja: 'デスクトップ beta 0.3.1:表紙補完の40作品制限を撤廃。視聴中/見たい作品を優先し、全番組の表紙を順次補完。読み込み失敗時はプレースホルダーを表示',
      en: 'Desktop beta 0.3.1: removed the 40-show cover limit, prioritizes Watching/Wish titles, then rate-limits completion for the whole timetable; failed images show a placeholder',
    },
  },
  {
    d: '2026-09-14',
    x: {
      'zh-Hans': '桌面端 beta 0.3.0:在看/未在看提醒可分别定时;右下角主题卡片展示封面、标题、放送时间与集数;关闭或最小化后驻留托盘',
      'zh-Hant': '桌面端 beta 0.3.0:在看/未在看提醒可分別定時;右下角主題卡片展示封面、標題、放送時間與集數;關閉或最小化後常駐系統匣',
      ja: 'デスクトップ beta 0.3.0:視聴中/その他の通知を個別設定。右下カードに表紙・題名・放送時刻・話数を表示。閉じる/最小化後もトレイに常駐',
      en: 'Desktop beta 0.3.0: separate Watching/other reminder schedules; rich bottom-right cards; close or minimize to keep running in the system tray',
    },
  },
  {
    d: '2026-08-05',
    x: {
      'zh-Hans': '修复:办过提前先行首映的新番(盗掘王)课表格位被首映时刻带偏,现按近五周实播定位;www.bgmtimetable.com 跳转主域名;GitHub Pages 镜像随每日数据自动更新',
      'zh-Hant': '修復:辦過提前先行首映的新番(盜掘王)課表格位被首映時刻帶偏,現按近五週實播定位;www.bgmtimetable.com 跳轉主域名;GitHub Pages 鏡像隨每日資料自動更新',
      ja: '修正:先行ワールドプレミア実施作(盗掘王)の時間割枠がプレミア時刻に引っ張られる問題。直近5週の実放送で判定。www は主ドメインへリダイレクト、Pages ミラーも毎日自動更新に',
      en: 'Fix: shows with early premiere events (Tomb Raider King) no longer sit in the premiere slot — placement now follows the last 5 weeks of actual airings; www now redirects to the apex domain; GitHub Pages mirror auto-updates daily',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '筛选新增「产地」:日本/中国/其他地区/未知 四类(拿不准的诚实标未知、每日复查,不误删);筛选选择跨会话记住;侧栏补番清单/更新日程限高滚动、可展开,不再截断条数',
      'zh-Hant': '篩選新增「產地」:日本/中國/其他地區/未知 四類(拿不準的誠實標未知、每日複查,不誤刪);篩選選擇跨會話記住;側欄補番清單/更新日程限高滾動、可展開,不再截斷條數',
      ja: '絞り込みに「制作国」を追加:日本/中国/その他/不明の4分類(不明作品は無理に分類せず毎日再確認)。絞り込み選択は保存。サイドバーの積みリスト/更新予定はスクロール+展開式で全件表示に',
      en: 'New "Region" filter: Japan / China / Other / Unknown (uncertain shows stay Unknown, rechecked daily); filter choices persist; sidebar backlog & schedule now scroll + expand, no more truncation',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '修复:海外延迟放送混进每集时刻造成一天两集(光美/神之水滴);柯南、哆啦A梦等长寿番的档期不再落错星期',
      'zh-Hant': '修復:海外延遲放送混進每集時刻造成一天兩集(光美/神之水滴);柯南、哆啦A夢等長壽番的檔期不再落錯星期',
      ja: '修正:海外の遅れ放送が混入し1日2話表示になる問題(プリキュア/神の雫)。コナン・ドラえもん等の長寿番組の曜日ズレも解消',
      en: 'Fix: overseas delayed broadcasts no longer duplicate episodes (PreCure/Kami no Shizuku); Conan, Doraemon & co. now sit on the right weekday',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '关于窗口与更新历史;界面四语言(简中/繁中/日本語/EN),番剧标题也随语言切换',
      'zh-Hant': '關於視窗與更新歷史;介面四語言(簡中/繁中/日本語/EN),番劇標題也隨語言切換',
      ja: 'このウィンドウと更新履歴を追加。UIが4言語対応、作品タイトルも言語に追従',
      en: 'About window & changelog; UI in 4 languages, show titles follow your language too',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '筛选面板:范围(新番/续播/长期)· 口碑(按人数加权)· 来源 · 题材',
      'zh-Hant': '篩選面板:範圍(新番/續播/長期)· 口碑(按人數加權)· 來源 · 題材',
      ja: '絞り込みパネル:範囲(新作/継続/長期)・評価(人数重み付け)・原作・ジャンル',
      en: 'Filter panel: scope (new/continuing/long-running) · vote-weighted rating · source · genre',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '修复:柯南/光美/小鲨鱼等长期档此前根本没进课表;跨季自动分级为续播/长期并垫色区分',
      'zh-Hant': '修復:柯南/光美/小鯊魚等長期檔此前根本沒進課表;跨季自動分級為續播/長期並墊色區分',
      ja: '修正:コナン・プリキュアなど長期枠が時間割に出ていなかった問題。継続/長期を自動判別し色分け',
      en: 'Fix: long-running shows (Conan, PreCure…) were missing entirely; cross-season shows now auto-classified & tinted',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '评分按评分人数贝叶斯加权:小样本高分不再霸榜,评分人数全站展示',
      'zh-Hant': '評分按評分人數貝葉斯加權:小樣本高分不再霸榜,評分人數全站展示',
      ja: '評価を人数でベイズ重み付け。少人数の高得点が上位を占めなくなり、評価人数も表示',
      en: 'Bayesian vote-weighted scores: tiny-sample 10.0s no longer top the charts; vote counts shown everywhere',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': 'bgm 式收藏面板:十星评分(官方文案)、标签、吐槽、仅自己可见,随收藏双向同步',
      'zh-Hant': 'bgm 式收藏面板:十星評分(官方文案)、標籤、吐槽、僅自己可見,隨收藏雙向同步',
      ja: 'bgm式の収蔵パネル:10段階評価・タグ・コメント・非公開設定。収蔵と双方向同期',
      en: 'bgm-style collection panel: 10-star rating, tags, comment, private flag — all two-way synced',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '动效体系:View Transitions 交叉淡化(不闪不残影)、iOS 式节奏、弹窗轻磨砂',
      'zh-Hant': '動效體系:View Transitions 交叉淡化(不閃不殘影)、iOS 式節奏、彈窗輕磨砂',
      ja: 'アニメーション刷新:View Transitionsのクロスフェード、iOS的なテンポ、ダイアログのすりガラス',
      en: 'Motion system: View Transitions crossfade (no flicker/ghosting), iOS-like timing, light glass dialogs',
    },
  },
  {
    d: '2026-07-10',
    x: {
      'zh-Hans': '深夜表记支持自定义边界(默认 26:00),凌晨时段"今天"的归属跟随深夜日界',
      'zh-Hant': '深夜表記支援自訂邊界(預設 26:00),凌晨時段"今天"的歸屬跟隨深夜日界',
      ja: '深夜表記の境界をカスタム可能に(既定26:00)。深夜帯の「今日」の扱いも日界に追従',
      en: 'Customizable late-night cutoff (default 26:00); “today” follows the late-night day boundary',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': 'OAuth 一键登录上线;正式域名 bgmtimetable.com(站点与令牌代理同域)',
      'zh-Hant': 'OAuth 一鍵登入上線;正式網域 bgmtimetable.com(站點與權杖代理同域)',
      ja: 'OAuthワンクリックログイン。正式ドメイン bgmtimetable.com(サイトとトークンプロキシ同一ドメイン)',
      en: 'OAuth one-click sign-in; official domain bgmtimetable.com (site & token proxy share one origin)',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': 'Bangumi 账号双向同步:个人令牌登录,状态/进度即时写回,离线改动进队列不丢',
      'zh-Hant': 'Bangumi 帳號雙向同步:個人權杖登入,狀態/進度即時寫回,離線改動進佇列不丟',
      ja: 'Bangumiアカウント双方向同期:トークンでログイン、ステータス/進捗を即時反映。オフライン変更もキューで保持',
      en: 'Two-way Bangumi sync: token sign-in, instant status/progress write-back, offline queue',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': '接入番組維基(bgm.wiki)每集精确时刻:年番休播漂移、一举多话全都对得上,每日自动同步',
      'zh-Hant': '接入番組維基(bgm.wiki)每集精確時刻:年番休播漂移、一舉多話全都對得上,每日自動同步',
      ja: '番組維基(bgm.wiki)の話数別放送時刻を導入:年間アニメの休止ズレや一挙放送も正確に。毎日自動同期',
      en: 'Per-episode exact air times from bgm.wiki: year-long drift & multi-ep drops all accurate, synced daily',
    },
  },
  {
    d: '2026-07-09',
    x: {
      'zh-Hans': '右侧常驻面板(详情/补番清单/撞档/迷你月历)、键盘快捷键、点标签筛选、备份导入导出、PWA',
      'zh-Hant': '右側常駐面板(詳情/補番清單/撞檔/迷你月曆)、鍵盤快捷鍵、點標籤篩選、備份匯入匯出、PWA',
      ja: 'サイドパネル(詳細/積みリスト/かぶり/ミニカレンダー)、ショートカット、タグ絞り込み、バックアップ、PWA',
      en: 'Side panel (details/backlog/conflicts/mini calendar), keyboard shortcuts, tag filtering, backup, PWA',
    },
  },
  {
    d: '2026-07-08',
    x: {
      'zh-Hans': '站点建立:日/周/月三视图课表、追番进度、时区切换、放送校正模型、八季归档',
      'zh-Hant': '站點建立:日/週/月三檢視課表、追番進度、時區切換、放送校正模型、八季歸檔',
      ja: 'サイト公開:日/週/月の時間割ビュー、視聴進捗、タイムゾーン切替、放送補正モデル、8期分アーカイブ',
      en: 'Launch: day/week/month timetable views, progress tracking, time zones, air-time fix model, 8 archived seasons',
    },
  },
]

declare const __APP_VERSION__: string

export default function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lang = getLang()

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal about">
        <button className="close" onClick={onClose} aria-label={t('关闭')}>
          ×
        </button>

        <div className="about-head">
          <h2>{t('番组课表')}</h2>
          <div className="tagline">{t('像课表一样追番。')}</div>
          <div className="ver">
            {t('版本 {v}', { v: __APP_VERSION__ })} · {t('基于 MIT 开源项目')}
          </div>
        </div>

        <div className="about-links">
          <a className="iconbtn" href={REPO} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            {t('GitHub 仓库')}
          </a>
          <a className="iconbtn" href={`${REPO}/issues/new`} target="_blank" rel="noreferrer" title={t('用得不顺、数据不对、想要新功能,都欢迎')}>
            {t('🐛 反馈问题')}
          </a>
        </div>

        <div className="set-note about-credit">
          {t('原项目作者：{author}；客户端二次开发：{maintainer}。', { author: 'Miint-Sunny', maintainer: 'MASUKA2018' })}{' '}
          <a href={UPSTREAM_REPO} target="_blank" rel="noreferrer">Miint-Sunny / Bangumi_ClassTimeTable</a>
        </div>

        <div className="set-note about-credit">
          {t('数据来自 Bangumi、bangumi-data、番組維基(bgm.wiki)与 yuc.wiki,感谢各社区的维护者。')}
        </div>

        <div className="dm-sec">
          <div className="sec-t">{t('更新历史')}</div>
          <div className="changelog">
            {CHANGELOG.map((e, i) => (
              <div key={i} className="cl-row">
                <span className="cl-date">{e.d}</span>
                <span className="cl-text">{e.x[lang]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
