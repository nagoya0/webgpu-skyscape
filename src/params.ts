// Settings from the URL query, the only way to change them until the UI is designed (ADR 0019).
// Unknown or malformed values fall back to the defaults. Names and values are ASCII only.
//
//   area=NAME         tokyo (default) or hakone (a trial of flying higher over mountains)
//   date=YYYY-MM-DD   date in JST (default: today in JST)
//   time=HH:MM        time of day in JST (default 16:30)
//   t=seconds         start time on the flight path (default 0)
//   paused            hold the flight at that time
//   exposure=number   exposure before tone mapping (default 3)
//   fov=degrees       vertical field of view (default 70)
//   lag=seconds       head lag in pitch, for the cockpit view; 0 is none (default 0)
//   shake=degrees     camera shake in steady flight (default 0)
//   shakeg=degrees    extra shake per G above 1 (default 0.04)
//   shakecloud=deg    extra shake at full cloud density (default 0.3)
//   sink=metres       eye moves down per G above 1, up per G below 1, for the cockpit view
//                     (default 0)
//   sinktime=seconds  time for the body to settle into a new load (default 0.15)
//   speed=m/s         speed on the placeholder path (default 250)
//   altitude=metres   height of the placeholder path above the ellipsoid (default 450)
//   bank=degrees      bank angle in the placeholder path's turns (default 70)
//   rollrate=deg/s    roll rate of the placeholder path (default 90)
//   buildings=0       leave out the PLATEAU buildings
//   textures=1        use PLATEAU's textured buildings (heavy on GPU memory)
//   tileerror=pixels  screen-space error target for the building tiles (default 20)
//   draw=MODE         how the building tiles are drawn: batch (default), bundle or plain
//   terrain=0         leave out the GSI terrain and aerial photographs
//   photodehaze=0..0.9   remove this much flat haze from the aerial photographs (default 0.15)
//   photocontrast=x   contrast of the aerial photographs, 1 unchanged (default 1.2)
//   photosat=x        saturation of the aerial photographs, 1 unchanged (default 1.4)
//                     (defaults chosen by the maintainer from a comparison, 2026-10-06)
//   clouds=0          leave out the clouds
//   groundshadow=0    leave out the cloud shadows on the terrain and buildings
//   coverage=0..1     cloud coverage (default 0.3)
//   wind=E,N          wind in m/s towards the east and the north, moving the clouds, e.g.
//                     wind=10,-5 (default 0,0, as takram)
//   cloudfx=LIST      cloud feature switches, comma-separated: +NAME turns one on, -NAME off,
//                     relative to the defaults (src/clouds/clouds.ts, docs/clouds-parity.md);
//                     e.g. cloudfx=-POWDER
//   raymarch=0        look up the aerial perspective in tables instead of ray marching it
//   flare=0           leave out the lens flare
//   measure           after loading, time 180 frames and report them in window.__debug
//   debug             show debug text: flight time, height, load factor, frame time

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export interface Params {
  area: 'tokyo' | 'hakone'
  date: Date
  flightStart: number
  paused: boolean
  exposure: number
  fov: number
  lag: number
  shake: number
  shakePerG: number
  shakeInCloud: number
  sink: number
  sinkTime: number
  speed: number
  altitude: number
  bank: number
  rollRate: number
  buildings: boolean
  textures: boolean
  terrain: boolean
  /** Aerial photograph correction: haze removed, contrast, saturation. */
  photoDehaze: number
  photoContrast: number
  photoSaturation: number
  measure: boolean
  debugText: boolean
  tileError: number
  drawMode: 'batch' | 'bundle' | 'plain'
  raymarch: boolean
  flare: boolean
  clouds: boolean
  groundShadow: boolean
  coverage: number
  /** Metres per second towards the east and the north. */
  wind: { east: number; north: number }
  /** Cloud feature changes against the defaults, e.g. { POWDER: false }. */
  cloudFeatures: Record<string, boolean>
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

  // Two plain decimal numbers, each within ±100 m/s.
  let wind = { east: 0, north: 0 }
  const windMatch = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(query.get('wind') ?? '')
  if (windMatch && Math.abs(Number(windMatch[1])) <= 100 && Math.abs(Number(windMatch[2])) <= 100) {
    wind = { east: Number(windMatch[1]), north: Number(windMatch[2]) }
  }

  return {
    area: query.get('area') === 'hakone' ? 'hakone' : 'tokyo',
    date,
    flightStart: number('t', 0, -1e6, 1e6),
    paused: query.has('paused'),
    exposure: number('exposure', 3, 0, 1e6),
    fov: number('fov', 70, 10, 150),
    lag: number('lag', 0, 0, 10),
    shake: number('shake', 0, 0, 10),
    shakePerG: number('shakeg', 0.04, 0, 10),
    shakeInCloud: number('shakecloud', 0.3, 0, 10),
    sink: number('sink', 0, 0, 1),
    sinkTime: number('sinktime', 0.15, 0.001, 10),
    speed: number('speed', 250, 1, 1000),
    altitude: number('altitude', 450, 0, 20_000),
    bank: number('bank', 70, 1, 85),
    rollRate: number('rollrate', 90, 1, 720),
    buildings: query.get('buildings') !== '0',
    textures: query.get('textures') === '1',
    terrain: query.get('terrain') !== '0',
    photoDehaze: number('photodehaze', 0.15, 0, 0.9),
    photoContrast: number('photocontrast', 1.2, 0, 4),
    photoSaturation: number('photosat', 1.4, 0, 4),
    measure: query.has('measure'),
    debugText: query.has('debug'),
    tileError: number('tileerror', 20, 0.5, 200),
    drawMode: (['batch', 'bundle', 'plain'] as const).find(m => m === query.get('draw')) ?? 'batch',
    raymarch: query.get('raymarch') !== '0',
    flare: query.get('flare') !== '0',
    clouds: query.get('clouds') !== '0',
    groundShadow: query.get('groundshadow') !== '0',
    coverage: number('coverage', 0.3, 0, 1),
    wind,
    cloudFeatures: Object.fromEntries(
      (query.get('cloudfx') ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(item => /^[+-]?[A-Z_]+$/.test(item))
        .map(item => [item.replace(/^[+-]/, ''), !item.startsWith('-')])
    )
  }
}
