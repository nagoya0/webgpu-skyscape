// State shared by the UI and the render loop (ADR 0037), as Preact signals: the render loop writes
// what the UI shows, and reads what the UI sets.
import { signal } from '@preact/signals'

/** Frames per second, averaged over about half a second; null until the first measurement. */
export const fps = signal<number | null>(null)

/** Whether the settings window is open. */
export const settingsOpen = signal(false)

/** False while the demo starts, behind the loading screen; the settings button waits for it. */
export const started = signal(false)
