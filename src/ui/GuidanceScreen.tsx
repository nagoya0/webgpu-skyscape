// The screen shown over the 3D view when the demo cannot run (ADR 0003, ADR 0037). In Japanese, as
// the viewer reads it and acts on it (the maintainer); technical details, such as missing GPU
// features or an error, stay in English below. Where reloading may help, it offers a reload.
// The ids are read by scripts/check-page.mjs.
import { signal } from '@preact/signals'

import { removeLoading } from './LoadingScreen'

export type GuidanceKind =
  | 'no-webgpu'
  | 'no-adapter'
  | 'missing-features'
  | 'renderer-failed'
  | 'device-lost'
  | 'start-failed'

const TEXTS: Record<GuidanceKind, { title: string; message: string; reload: boolean }> = {
  'no-webgpu': {
    title: 'このブラウザは WebGPU に対応していません',
    message: 'このデモは WebGPU で描画しています。WebGPU に対応したブラウザ（最新の Chrome、Edge など）で開いてください。',
    reload: false
  },
  'no-adapter': {
    title: 'GPU を利用できません',
    message:
      'ブラウザは WebGPU に対応していますが、GPU を使えない状態です。ブラウザの設定でハードウェアアクセラレーション（グラフィック アクセラレーション）が有効になっているか確認してください。GPU やドライバーが対応していない場合もあります。',
    reload: false
  },
  'missing-features': {
    title: 'この GPU では動作しません',
    message: 'このデモに必要な GPU の機能が足りません。別の GPU を搭載したパソコンでお試しください。',
    reload: false
  },
  'renderer-failed': {
    title: 'WebGPU で起動できませんでした',
    message: 'ブラウザと GPU のドライバーを最新にしてから、再読み込みしてください。',
    reload: true
  },
  'device-lost': {
    title: 'GPU との接続が切れました',
    message: 'ドライバーの再起動などで、GPU との接続が切れました。再読み込みしてください。',
    reload: true
  },
  'start-failed': {
    title: 'デモを開始できませんでした',
    message: 'データの読み込みに失敗した可能性があります。通信状況を確認して、再読み込みしてください。',
    reload: true
  }
}

const shown = signal<{ kind: GuidanceKind; details: readonly string[] } | null>(null)

/** Shows the screen for a reason the demo cannot run, in place of the loading screen. */
export function showGuidance(kind: GuidanceKind, details: readonly string[] = []): void {
  removeLoading()
  shown.value = { kind, details }
}

export function GuidanceScreen() {
  const current = shown.value
  if (!current) return null
  const text = TEXTS[current.kind]
  return (
    <section id="guidance" class="guidance" role="alert">
      <div class="guidance-box">
        <h2>{text.title}</h2>
        <p id="guidance-reason">{text.message}</p>
        {current.details.length > 0 && (
          <ul id="guidance-details" class="guidance-details">
            {current.details.map(detail => (
              <li>{detail}</li>
            ))}
          </ul>
        )}
        {text.reload && (
          <button type="button" class="text-button" onClick={() => location.reload()}>
            再読み込み
          </button>
        )}
      </div>
    </section>
  )
}
