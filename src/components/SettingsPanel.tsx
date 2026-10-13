import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { BgmAccount, Settings } from '../types'
import { clearApiCache } from '../lib/api'
import { t, wdFull } from '../lib/i18n'
import type { OauthConf } from '../lib/oauth'
import type { ReminderKind, ReminderStatus } from '../lib/notifications'
import { getAutostartEnabled, setAutostartEnabled, supportsAutostart } from '../lib/autostart'
import { THEMES } from '../lib/themes'

interface Props {
  settings: Settings
  friendErrors: Record<string, string>
  account: BgmAccount | null
  sync: { msg: string; busy: boolean; error?: boolean }
  scheduleDataAt?: string
  oauth: OauthConf | null
  reminderStatus: Record<ReminderKind, ReminderStatus>
  onOauthLogin: () => void
  onLogin: (token: string) => Promise<void>
  onLogout: () => void
  onSyncNow: () => void
  onChange: (patch: Partial<Settings>) => void
  onReminderEnabled: (kind: ReminderKind, enabled: boolean) => void
  onTestReminder: (kind: ReminderKind) => void
  onExportIcs: () => void
  onClose: () => void
  features: ReactNode
  syncPaused: boolean
}

export default function SettingsPanel({
  settings,
  friendErrors,
  account,
  sync,
  scheduleDataAt,
  oauth,
  reminderStatus,
  onOauthLogin,
  onLogin,
  onLogout,
  onSyncNow,
  onChange,
  onReminderEnabled,
  onTestReminder,
  onExportIcs,
  onClose,
  features,
  syncPaused,
}: Props) {
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [loginErr, setLoginErr] = useState('')
  const autostartSupported = supportsAutostart()
  const [autostartEnabled, setAutostartState] = useState<boolean | null>(null)
  const [autostartBusy, setAutostartBusy] = useState(false)
  const [autostartError, setAutostartError] = useState(false)

  useEffect(() => {
    if (!autostartSupported) return
    let active = true
    getAutostartEnabled()
      .then((enabled) => {
        if (active) setAutostartState(enabled)
      })
      .catch(() => {
        if (active) setAutostartError(true)
      })
    return () => {
      active = false
    }
  }, [autostartSupported])

  const changeAutostart = async (enabled: boolean) => {
    if (autostartBusy || autostartEnabled === enabled) return
    setAutostartBusy(true)
    setAutostartError(false)
    try {
      setAutostartState(await setAutostartEnabled(enabled))
    } catch {
      setAutostartError(true)
    } finally {
      setAutostartBusy(false)
    }
  }

  const addFriend = () => {
    const n = name.trim()
    if (!n || settings.friends.includes(n)) return
    onChange({ friends: [...settings.friends, n] })
    setName('')
  }

  const doLogin = async () => {
    const tok = token.trim()
    if (!tok || verifying) return
    setVerifying(true)
    setLoginErr('')
    try {
      await onLogin(tok)
      setToken('')
    } catch (e) {
      setLoginErr(
        e instanceof Error && e.message.includes('401') ? t('令牌无效或已过期') : t('验证失败,请检查网络后重试'),
      )
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label={t('关闭')}>
          ×
        </button>
        <h2 style={{ margin: '0 0 10px', fontWeight: 'normal', fontSize: 16, color: 'var(--pink-strong)' }}>
          {t('设置')}
        </h2>

        <div className="set-row">
          <span className="lbl">Bangumi</span>
          {account && !account.invalid ? (
            <span className="bgm-acc">
              {account.avatar && <img src={account.avatar} alt="" />}
              <b>{account.nickname}</b>
              <span className="dim">@{account.username}</span>
              <button className="iconbtn" disabled={sync.busy} onClick={onSyncNow}>
                {t(sync.busy ? '同步中…' : syncPaused ? '恢复同步' : '↻ 立即同步')}
              </button>
              <button className="iconbtn" onClick={onLogout}>
                {t('断开')}
              </button>
            </span>
          ) : (
            <span className="friend-add">
              {oauth && (
                <>
                  <button className="iconbtn accent" onClick={onOauthLogin}>
                    {t('用 Bangumi 登录')}
                  </button>
                  <span className="or">{t('或')}</span>
                </>
              )}
              <input
                type="password"
                value={token}
                placeholder={t('粘贴访问令牌(token)')}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
              />
              <button className="iconbtn" disabled={verifying || !token.trim()} onClick={doLogin}>
                {t(verifying ? '验证中…' : '连接')}
              </button>
            </span>
          )}
        </div>
        {account?.invalid && (
          <div className="set-sub err">
            {t(account.kind === 'oauth' ? '登录已过期,请重新登录。' : '令牌已失效或被吊销,请生成新令牌后重新粘贴。')}
          </div>
        )}
        {loginErr && <div className="set-sub err">{loginErr}</div>}
        {account && !account.invalid && sync.msg && (
          <div className={`set-sub${sync.error || sync.msg.includes('失败') ? ' err' : ''}`}>{sync.msg}</div>
        )}
        {!account && sync.msg.includes('登录失败') && <div className="set-sub err">{sync.msg}</div>}
        {!account && (
          <div className="set-sub">
            {oauth && <>{t('「用 Bangumi 登录」跳转 bgm.tv 授权(需在 bgm.tv 域名下登录过),令牌 7 天有效、自动续期。 ')}</>}
            {t('也可在')}{' '}
            <a href="https://next.bgm.tv/demo/access-token" target="_blank" rel="noreferrer">
              next.bgm.tv/demo/access-token
            </a>{' '}
            {t(
              '生成个人令牌(建议选一年有效期)粘贴连接。令牌只保存在本机浏览器,不进备份文件,可随时吊销。 连接后:应用内的追番改动写回 bgm.tv;云端改动每 5 分钟检查，并在切回窗口或恢复联网时刷新。 首次连接会双向合并(状态本机优先、进度取较大值)。bgm 的「搁置」保留进度并暂停提醒; 本地取消追番不会删除 bgm 收藏。',
            )}
          </div>
        )}
        <div className="set-sub">{t('支持“搁置”状态，保留进度并暂停提醒。')}</div>
        <div className="set-sub">{t('两台设备连接同一个 Bangumi 账号即可同步观看进度。启动、切回窗口及恢复联网时刷新，运行中每 5 分钟检查；不是实时推送。')}</div>

        <div className="set-row theme-setting">
          <span className="lbl">{t('主题')}</span>
          <span className="theme-grid">
            {THEMES.map((theme) => (
              <button
                type="button"
                key={theme.id}
                className={`theme-preview${settings.theme === theme.id ? ' on' : ''}`}
                aria-pressed={settings.theme === theme.id}
                style={{ '--preview-bg': theme.background, '--preview-fg': theme.foreground, '--preview-accent': theme.accent } as CSSProperties}
                onClick={() => onChange({ theme: theme.id, themeMode: 'manual' })}
              >
                <span className="theme-swatches" aria-hidden><i /><i /><i /></span>
                <span className="theme-label">{t(theme.label)}</span>
                {settings.theme === theme.id && <span className="theme-check" aria-hidden>✓</span>}
              </button>
            ))}
          </span>
        </div>

        {autostartSupported && (
          <div className="autostart-setting">
            <div className="set-row">
              <span className="lbl">{t('开机启动')}</span>
              <span className="seg small">
                <button
                  className={autostartEnabled === true ? 'on' : ''}
                  disabled={autostartBusy || (autostartEnabled === null && !autostartError)}
                  onClick={() => changeAutostart(true)}
                >
                  {t('自动启动')}
                </button>
                <button
                  className={autostartEnabled === false ? 'on' : ''}
                  disabled={autostartBusy || (autostartEnabled === null && !autostartError)}
                  onClick={() => changeAutostart(false)}
                >
                  {t('不自动启动')}
                </button>
              </span>
              {autostartEnabled === null && !autostartError && <span className="data-updated">{t('正在读取…')}</span>}
            </div>
            <div className="set-sub">{t('登录系统后静默启动并驻留托盘，按设置继续发送提醒。')}</div>
            {autostartError && (
              <div className="set-sub err" role="status" aria-live="polite">
                {t('无法读取或修改开机启动设置，请稍后重试。')}
              </div>
            )}
          </div>
        )}

        <div className="set-row">
          <span className="lbl">{t('周起始')}</span>
          <span className="seg small">
            <button className={settings.weekStart === 1 ? 'on' : ''} onClick={() => onChange({ weekStart: 1 })}>
              {wdFull(1)}
            </button>
            <button className={settings.weekStart === 7 ? 'on' : ''} onClick={() => onChange({ weekStart: 7 })}>
              {wdFull(7)}
            </button>
          </span>
        </div>

        <div className="set-row">
          <span className="lbl">{t('深夜表记')}</span>
          <span className="seg small">
            <button
              className={settings.lateNightCutoff > 0 ? 'on' : ''}
              onClick={() => settings.lateNightCutoff === 0 && onChange({ lateNightCutoff: 2 })}
            >
              {t('凌晨归前日')}
            </button>
            <button
              className={settings.lateNightCutoff === 0 ? 'on' : ''}
              onClick={() => onChange({ lateNightCutoff: 0 })}
            >
              {t('按实际日期')}
            </button>
          </span>
          {settings.lateNightCutoff > 0 && (
            <select
              className="cut-sel"
              title={t('几点之前算前一天的深夜档')}
              value={settings.lateNightCutoff}
              onChange={(e) => onChange({ lateNightCutoff: +e.target.value })}
            >
              {[1, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>
                  {t('{h}:00 前(表记到 {e}:59)', { h, e: 23 + h })}
                </option>
              ))}
            </select>
          )}
        </div>

        {(
          [
            {
              kind: 'watching',
              label: '在看提醒',
              enabled: settings.watchingReminderEnabled,
              time: settings.watchingReminderTime,
              hint: '当天更新的“在看”番剧使用带封面的主题卡片提醒。',
            },
            {
              kind: 'other',
              label: '未在看提醒',
              enabled: settings.otherReminderEnabled,
              time: settings.otherReminderTime,
              hint: '当天更新但未标记“在看”的番剧单独提醒。',
            },
          ] as const
        ).map((reminder) => {
          const status = reminderStatus[reminder.kind]
          return (
            <div className="reminder-setting" key={reminder.kind}>
              <div className="set-row">
                <span className="lbl">{t(reminder.label)}</span>
                <span className="seg small">
                  <button className={reminder.enabled ? 'on' : ''} onClick={() => onReminderEnabled(reminder.kind, true)}>
                    {t('开启提醒')}
                  </button>
                  <button className={!reminder.enabled ? 'on' : ''} onClick={() => onReminderEnabled(reminder.kind, false)}>
                    {t('关闭提醒')}
                  </button>
                </span>
                <input
                  className="reminder-time"
                  type="time"
                  aria-label={t('提醒时间')}
                  title={t('提醒时间')}
                  value={reminder.time}
                  disabled={!reminder.enabled}
                  onChange={(e) =>
                    onChange(
                      reminder.kind === 'watching'
                        ? { watchingReminderTime: e.target.value }
                        : { otherReminderTime: e.target.value },
                    )
                  }
                />
                <button className="iconbtn" onClick={() => onTestReminder(reminder.kind)}>
                  {t('预览提醒')}
                </button>
              </div>
              <div className="set-sub">{t(reminder.hint)}</div>
              {status !== 'idle' && (
                <div className={`set-sub${['denied', 'unsupported', 'failed'].includes(status) ? ' err' : ''}`}>
                  {t(
                    status === 'enabled'
                      ? '提醒已开启'
                      : status === 'sent'
                        ? '提醒已显示'
                        : status === 'denied'
                          ? '通知权限被拒绝,请在系统设置中允许番组课表发送通知。'
                          : status === 'unsupported'
                            ? '当前环境不支持系统通知。'
                            : '显示提醒失败,请稍后重试。',
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div className="set-sub reminder-note">{t('两类提醒可使用不同时间；客户端需要保持运行。')}</div>

        <div className="set-row">
          <span className="lbl">{t('好友')}</span>
          <span className="friend-add">
            <input
              value={name}
              placeholder={t('bgm 用户名(个人页 URL 尾段)')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            />
            <button className="iconbtn" onClick={addFriend}>
              {t('添加')}
            </button>
          </span>
        </div>
        {settings.friends.map((f) => (
          <div key={f} className="friend-item">
            <button className="rm" onClick={() => onChange({ friends: settings.friends.filter((x) => x !== f) })}>
              ✕
            </button>
            <span>{f}</span>
            {friendErrors[f] && <span className="err">{friendErrors[f]}</span>}
          </div>
        ))}

        <div className="set-row" style={{ marginTop: 16 }}>
          <span className="lbl">{t('导出')}</span>
          <button className="iconbtn" onClick={onExportIcs}>
            {t('📅 导出我的追番日历(.ics)')}
          </button>
        </div>

        {features}

        <div className="set-row">
          <span className="lbl">{t('数据')}</span>
          <button
            className="iconbtn"
            onClick={() => {
              clearApiCache()
              location.reload()
            }}
          >
            {t('清缓存并刷新')}
          </button>
          {scheduleDataAt && (
            <span className="data-updated">
              {t('逐集时间更新:{time}', { time: new Date(scheduleDataAt).toLocaleString() })}
            </span>
          )}
        </div>

        <div className="set-note">
          {t('数据来源:Bangumi 官方 API(每 6 小时缓存)· bangumi-data 数据集(jsDelivr CDN,每日缓存)· 每集精确时刻来自')}{' '}
          <a href="https://bgm.wiki" target="_blank" rel="noreferrer">
            番組維基 bgm.wiki
          </a>
          {t('(经其开发者 API 每日同步,致谢其编辑者社区)· 可选的 yuc.wiki 增强数据由 AI 辅助的 refresh-data skill 人工触发生成,不做自动抓取。')}
          <br />
          {t('追番状态与进度保存在本机浏览器(localStorage);连接 Bangumi 账号(上方一键登录或个人令牌)后与 bgm.tv 收藏双向同步。')}
          <br />
          {t('好友进度读取的是对方在 bgm.tv 上公开的收藏,仅"在看"状态,缓存 1 小时。')}
        </div>
      </div>
    </div>
  )
}
