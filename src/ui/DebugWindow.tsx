// The debug window (ADR 0037), shown with the debug switch in the settings window or ?debug.
// Rendering figures, laid out as the maintainer asked; they are measured only while the window is
// shown (src/main.ts writes them a few times a second).
import { signal } from '@preact/signals'

import { live } from './settings'

export interface DebugStats {
  /** Seconds on the flight path, and whether the start is still loading. */
  flightTime: number
  loading: boolean
  /** Milliseconds per frame, averaged. */
  frameMs: number
  /** Milliseconds of JavaScript per frame until the GPU commands are sent, averaged. */
  cpuMs: number
  /** Bytes of JavaScript heap in use, where the browser tells (Chrome). */
  heapBytes: number | null
  /** Milliseconds of GPU work per frame, from timestamp queries, where the device supports them. */
  gpuMs: number | null
  /** Bytes of GPU memory that three.js has allocated for textures, buffers and shaders. */
  gpuBytes: number
  triangles: number
  drawCalls: number
  /** The canvas in device pixels, the size the scene is rendered at, and the pixel ratio. */
  width: number
  height: number
  pixelRatio: number
}

export const debugStats = signal<DebugStats | null>(null)

/** A count in K or M (the maintainer): 850, 140.6K, 1.25M. */
export function compactCount(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1e6) return `${(count / 1000).toFixed(1)}K`
  return `${(count / 1e6).toFixed(2)}M`
}

export function DebugWindow() {
  const stats = debugStats.value
  if (!live.debug.value || !stats) return null
  const ms = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} ms`)
  const mb = (bytes: number | null) => (bytes === null ? '—' : `${(bytes / 1048576).toFixed(0)} MB`)
  return (
    <div class="debug-window" aria-live="off">
      <div class="debug-group">Scene:</div>
      <div class="debug-line">
        t: {stats.flightTime.toFixed(1)} s{stats.loading ? ' (loading)' : ''}
      </div>
      {/* Labels chosen with the maintainer to say what is measured: the frame time follows the
          display's refresh, CPU (JS) is this page's JavaScript only, the GPU memory is what
          three.js has allocated, not what the driver uses. */}
      <div class="debug-group">Graphics:</div>
      <div class="debug-line">Frame: {ms(stats.frameMs)}</div>
      <div class="debug-line">
        <span class="debug-pair">CPU (JS): {ms(stats.cpuMs)}</span>
        JS heap: {mb(stats.heapBytes)}
      </div>
      <div class="debug-line">
        <span class="debug-pair">GPU: {ms(stats.gpuMs)}</span>
        GPU memory (est.): {mb(stats.gpuBytes)}
      </div>
      <div class="debug-line">Tris: {compactCount(stats.triangles)}</div>
      <div class="debug-line">
        Resolution: {stats.width}×{stats.height}
        {stats.pixelRatio !== 1 ? ` (DPR ${Number(stats.pixelRatio.toFixed(2))})` : ''}
      </div>
      <div class="debug-line">Draw calls: {stats.drawCalls}</div>
    </div>
  )
}
