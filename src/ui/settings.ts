// The settings shown in the settings window (ADR 0037), as signals that the window and the render
// loop share. They start from the URL parameters (src/params.ts) and all apply while the demo
// runs.
import { signal } from '@preact/signals'

import type { Params } from '../params'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export type CloudAmount = Params['cloudAmount']

export const live = {
  /** The scene's date and time, given to the atmosphere. */
  date: signal(new Date()),
  paused: signal(false),
  hud: signal(true),
  /** Cloud coverage of all layers, 0 to 1. */
  coverage: signal(0.3),
  cloudAmount: signal<CloudAmount>('normal'),
  debug: signal(false)
}

/** Flight time in seconds, written by the render loop a few times a second for the window. */
export const flightTime = signal(0)
/** The length of the flight path in seconds, once loaded. */
export const flightDuration = signal(0)
/** A flight time the window asks the render loop to move to, or null. */
export const seekTo = signal<number | null>(null)

export function initSettings(params: Params): void {
  live.date.value = params.date
  live.paused.value = params.paused
  live.hud.value = params.hud
  live.coverage.value = params.coverage
  live.cloudAmount.value = params.cloudAmount
  live.debug.value = params.debugText
}

/** "YYYY-MM-DD" and "HH:MM" in JST. */
export function jstParts(date: Date): { day: string; time: string } {
  const iso = new Date(date.getTime() + JST_OFFSET_MS).toISOString()
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) }
}

/** A date from "YYYY-MM-DD" and "HH:MM" in JST, or null if either is malformed. */
export function fromJst(day: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const t = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const utc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  return new Date(utc - JST_OFFSET_MS)
}
