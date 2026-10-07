import { describe, expect, it } from 'vitest'

import { readParams } from '../params'
import { fromJst, initSettings, jstParts, live } from './settings'

const now = new Date('2026-10-08T03:00:00Z')

describe('settings', () => {
  it('reads and writes JST dates', () => {
    const date = fromJst('2026-12-24', '06:05')!
    expect(date.toISOString()).toBe('2026-12-23T21:05:00.000Z')
    expect(jstParts(date)).toEqual({ day: '2026-12-24', time: '06:05' })
    expect(fromJst('2026-12-24', 'six')).toBeNull()
  })

  it('starts from the URL parameters', () => {
    initSettings(readParams('?time=06:00&paused&hud=0&cloudamount=few&coverage=0.5&debug', now))
    expect(jstParts(live.date.value).time).toBe('06:00')
    expect(live.paused.value).toBe(true)
    expect(live.hud.value).toBe(false)
    expect(live.cloudAmount.value).toBe('few')
    expect(live.coverage.value).toBe(0.5)
    expect(live.debug.value).toBe(true)
  })
})
