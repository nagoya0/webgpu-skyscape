import { describe, expect, it } from 'vitest'

import { sceneTimeText } from './sceneTime'

describe('sceneTimeText', () => {
  it('writes the date and time in JST', () => {
    expect(sceneTimeText(new Date('2026-10-07T07:30:00Z'))).toBe('SCENE 2026-10-07 16:30 JST')
    expect(sceneTimeText(new Date('2026-10-07T20:05:00Z'))).toBe('SCENE 2026-10-08 05:05 JST')
  })
})
