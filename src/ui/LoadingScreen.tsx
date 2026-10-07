// The loading screen (ADR 0037): over the 3D view only, a message saying what is being done and
// one progress bar for the whole start, in the settings window's look. The messages are in
// English, as the viewer only watches them (the maintainer). It shows from the page's first
// moment; src/main.ts moves it through the stages and hides it when the start is complete.
import { signal } from '@preact/signals'

import { started } from './state'

export const loadingMessage = signal('Starting WebGPU...')
/** 0 to 1. Never goes back. */
const progress = signal(0)
/** 'shown', then 'fading' for the fade-out, then 'gone'. */
const phase = signal<'shown' | 'fading' | 'gone'>('shown')

/** Sets the progress, which never goes back. */
export function setLoadingProgress(value: number): void {
  progress.value = Math.max(progress.value, Math.min(1, value))
}

/** Fades the screen out. */
export function hideLoading(): void {
  if (phase.value !== 'shown') return
  progress.value = 1
  phase.value = 'fading'
  started.value = true
  // As long as the CSS transition; removed then even if no transition runs (reduced motion).
  setTimeout(() => (phase.value = 'gone'), 900)
}

export function LoadingScreen() {
  if (phase.value === 'gone') return null
  return (
    <div class={`loading${phase.value === 'fading' ? ' done' : ''}`} role="status" aria-live="polite">
      <div class="loading-box">
        <div class="loading-message">{loadingMessage.value}</div>
        <div
          class="loading-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.value * 100)}
        >
          <div class="loading-fill" style={{ transform: `scaleX(${progress.value})` }} />
        </div>
      </div>
    </div>
  )
}
