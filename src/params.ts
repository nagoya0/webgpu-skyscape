// Settings from the URL query, the only way to change them until the UI is designed (ADR 0019).
// Unknown or malformed values fall back to the defaults.
//
//   date=YYYY-MM-DD   date in JST (default: today in JST)
//   time=HH:MM        time of day in JST (default 16:30)
//   t=seconds         start time on the flight path (default 0)
//   paused            hold the flight at that time
//   exposure=number   exposure before tone mapping (default 3)
//   fov=degrees       vertical field of view (default 70)
//   lag=seconds       head lag of the first-person camera (default 0.12)
//   shake=degrees     shake of the first-person camera (default 0.06)
//   sink=metres       eye sinking per G above 1 (default 0.015)
//   speed=m/s         speed on the placeholder path (default 250)
//   altitude=metres   height of the placeholder path (default 1500)
//   bank=degrees      bank angle in the placeholder path's turns (default 70)
//   rollrate=deg/s    roll rate of the placeholder path (default 90)

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export interface Params {
  date: Date
  flightStart: number
  paused: boolean
  exposure: number
  fov: number
  lag: number
  shake: number
  sink: number
  speed: number
  altitude: number
  bank: number
  rollRate: number
}

export function readParams(search: string, now = new Date()): Params {
  const query = new URLSearchParams(search)
  const number = (name: string, fallback: number, min: number, max: number): number => {
    const raw = query.get(name)
    if (raw === null || raw.trim() === '') return fallback
    const value = Number(raw)
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
  }

  // The day in JST: from date=, or today.
  const todayJST = new Date(now.getTime() + JST_OFFSET_MS)
  let year = todayJST.getUTCFullYear()
  let month = todayJST.getUTCMonth()
  let day = todayJST.getUTCDate()
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(query.get('date') ?? '')
  if (dateMatch) {
    year = Number(dateMatch[1])
    month = Number(dateMatch[2]) - 1
    day = Number(dateMatch[3])
  }
  let minutes = 16 * 60 + 30
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(query.get('time') ?? '')
  if (timeMatch && Number(timeMatch[1]) < 24 && Number(timeMatch[2]) < 60) {
    minutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2])
  }
  const date = new Date(Date.UTC(year, month, day) - JST_OFFSET_MS + minutes * 60_000)

  return {
    date,
    flightStart: number('t', 0, -1e6, 1e6),
    paused: query.has('paused'),
    exposure: number('exposure', 3, 0, 1e6),
    fov: number('fov', 70, 10, 150),
    lag: number('lag', 0.12, 0.001, 10),
    shake: number('shake', 0.06, 0, 10),
    sink: number('sink', 0.015, 0, 1),
    speed: number('speed', 250, 1, 1000),
    altitude: number('altitude', 1500, 0, 20_000),
    bank: number('bank', 70, 1, 85),
    rollRate: number('rollrate', 90, 1, 720)
  }
}
