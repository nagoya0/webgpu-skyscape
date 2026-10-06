import { describe, expect, it } from 'vitest'

import { readParams } from './params'

const now = new Date('2026-10-05T03:00:00Z') // 12:00 JST

describe('readParams', () => {
  it('defaults to 16:30 JST today', () => {
    const params = readParams('', now)
    expect(params.date.toISOString()).toBe('2026-10-05T07:30:00.000Z')
    expect(params.exposure).toBe(3)
    expect(params.paused).toBe(false)
  })

  it('reads date and time in JST', () => {
    const params = readParams('?date=2026-12-24&time=06:05', now)
    expect(params.date.toISOString()).toBe('2026-12-23T21:05:00.000Z')
  })

  it('uses today in JST when UTC is still the day before', () => {
    const lateUTC = new Date('2026-10-04T20:00:00Z') // 05:00 JST on 10-05
    expect(readParams('?time=12:00', lateUTC).date.toISOString()).toBe('2026-10-05T03:00:00.000Z')
  })

  it('reads numbers and flags', () => {
    const params = readParams('?t=45&paused&exposure=5&lag=0.3&bank=60', now)
    expect(params.flightStart).toBe(45)
    expect(params.paused).toBe(true)
    expect(params.exposure).toBe(5)
    expect(params.lag).toBe(0.3)
    expect(params.bank).toBe(60)
  })

  it('reads cloud feature switches', () => {
    expect(readParams('?cloudfx=-POWDER,+HAZE,SHADOW_LENGTH,bad-name', now).cloudFeatures).toEqual({
      POWDER: false,
      HAZE: true,
      SHADOW_LENGTH: true
    })
    expect(readParams('', now).cloudFeatures).toEqual({})
  })

  it('reads the wind', () => {
    expect(readParams('?wind=10,-5.5', now).wind).toEqual({ east: 10, north: -5.5 })
    expect(readParams('', now).wind).toEqual({ east: 0, north: 0 })
    for (const bad of ['10', '10,abc', '200,0', '１０,0', '10, 5']) {
      expect(readParams(`?wind=${encodeURIComponent(bad)}`, now).wind).toEqual({ east: 0, north: 0 })
    }
  })

  it('falls back on malformed or out-of-range values', () => {
    const params = readParams('?time=25:00&exposure=abc&bank=90&fov=', now)
    expect(params.date.toISOString()).toBe('2026-10-05T07:30:00.000Z')
    expect(params.exposure).toBe(3)
    expect(params.bank).toBeNull()
    expect(params.fov).toBe(70)
  })
})
