// The settings window (ADR 0037): opened from the header, over the 3D view dimmed a little. It
// closes with its close button, the Escape key, or a click on the dimmed view. Two tabs, as the
// maintainer asked: the settings, and the data credits (moved from the corner of the view; GSI
// asks for the credit and a link to its tile list, without a place on screen). The tab last shown
// is shown again on the next opening.
import { signal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'

import { SettingsTab } from './SettingsTab'
import { settingsOpen } from './state'

const TABS = [
  { id: 'settings', label: '設定' },
  { id: 'credits', label: 'クレジット' }
] as const
type TabId = (typeof TABS)[number]['id']

const currentTab = signal<TabId>('settings')

export function SettingsWindow() {
  const open = settingsOpen.value
  const panel = useRef<HTMLDivElement>(null)
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    // Focus the window, and give the focus back to the settings button when it closes.
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settingsOpen.value = false
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [open])

  if (!open) return null

  // The arrow keys move between the tabs, as in a tab list.
  const onTabKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    currentTab.value = TABS[next].id
    tabButtons.current[next]?.focus()
  }

  return (
    <div class="backdrop" onClick={event => event.target === event.currentTarget && (settingsOpen.value = false)}>
      <div class="window" role="dialog" aria-modal="true" aria-label="設定" tabIndex={-1} ref={panel}>
        <div class="window-header">
          <div class="tabs" role="tablist">
            {TABS.map((tab, index) => (
              <button
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                class="tab"
                aria-selected={currentTab.value === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={currentTab.value === tab.id ? 0 : -1}
                ref={element => {
                  tabButtons.current[index] = element
                }}
                onClick={() => (currentTab.value = tab.id)}
                onKeyDown={event => onTabKey(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button type="button" class="icon-button" aria-label="閉じる" title="閉じる" onClick={() => (settingsOpen.value = false)}>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
        {/* Both tabs are laid in the same place and the one not shown is hidden, so the window
            keeps the size of the larger one when the tab changes (the maintainer's request). */}
        <div class="window-body tab-panels">
          {TABS.map(tab => {
            const shown = currentTab.value === tab.id
            return (
              <div
                class={`tab-panel${shown ? '' : ' inactive'}`}
                role="tabpanel"
                id={`panel-${tab.id}`}
                aria-labelledby={`tab-${tab.id}`}
                aria-hidden={!shown}
                inert={!shown}
              >
                {tab.id === 'settings' ? <SettingsTab /> : <CreditsTab />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CreditsTab() {
  return (
    <ul class="credits">
      <li>
        地形・航空写真：
        <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">
          国土地理院（地理院タイル）
        </a>
        を加工して作成
      </li>
      <li>
        市区町村：
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html" target="_blank" rel="noopener">
          国土数値情報（行政区域データ）国土交通省
        </a>
        を加工して作成
      </li>
      <li>
        市街地の明かり：
        <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A16-2020.html" target="_blank" rel="noopener">
          国土数値情報（人口集中地区データ）国土交通省
        </a>
        を加工して作成
      </li>
      <li>
        星：
        <a href="https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50" target="_blank" rel="noopener">
          Bright Star Catalogue 第5改訂版（Hoffleit &amp; Warren, 1991）
        </a>
        をもとにした takram のデータ
      </li>
      <li>
        ソフトウェアのライセンス：
        <a
          href="https://github.com/nagoya0/webgpu-skyscape#licence-and-credits"
          target="_blank"
          rel="noopener"
        >
          README
        </a>
      </li>
    </ul>
  )
}
