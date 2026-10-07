// Settings from the URL query, the only way to change them until the UI is designed (ADR 0019).
// Unknown or malformed values fall back to the defaults. Names and values are ASCII only.
//
//   area=NAME         hakone (default; Sagami Bay, Hakone and Mount Fuji, ADR 0028) or tokyo
//                     (central Tokyo with PLATEAU buildings, the earlier area)
//   date=YYYY-MM-DD   date in JST (default: today in JST)
//   time=HH:MM        time of day in JST (default 16:30)
//   t=seconds         start time on the flight path (default 0)
//   paused            hold the flight at that time
//   path=NAME         fly a path computed with JSBSim, public/paths/NAME.json (tools/flightpath),
//                     or path=racetrack for the placeholder racetrack (default by area: Hakone
//                     the course of ADR 0035, Tokyo the racetrack)
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
//   altitude=metres   height of the placeholder path above the ellipsoid (default by area:
//                     Hakone 3000, Tokyo 450)
//   bank=degrees      bank angle in the placeholder path's turns (default by area: Hakone 45,
//                     Tokyo 70)
//   rollrate=deg/s    roll rate of the placeholder path (default 90)
//   buildings=0       leave out the PLATEAU buildings
//   textures=1        use PLATEAU's textured buildings (heavy on GPU memory)
//   tileerror=pixels  screen-space error target for the building tiles (default 20)
//   draw=MODE         how the building tiles are drawn: batch (default), bundle or plain
//   terrain=0         leave out the GSI terrain and aerial photographs
//   terraintexel=px   refine terrain tiles while a photograph texel covers more than this many
//                     pixels; smaller is sharper and loads more tiles (default 1.5)
//   landspecular=0..1 specular intensity of land; 0 reflects diffusely only, 1 as a standard
//                     material; water stays fully specular (default 0, ADR 0032)
//   terraindebug=1    tint terrain tiles by zoom level: 8 red, 9 orange, 10 yellow, 11 green,
//                     12 cyan, 13 blue, 14 purple, 15 white, 16 red
//   terraindebug=2    show the aerial photographs as they are, without lighting or water
//   terraindebug=3    show the water mask in red
//   terraindebug=4    draw the terrain plain grey, lit, without photographs or water
//   terraindebug=5    show the normal used for lighting as colour: world x, y, z (north, up,
//                     east) to red, green, blue
//   photodehaze=0..0.9   remove this much flat haze from the aerial photographs (default 0.15)
//   photocontrast=x   contrast of the aerial photographs, 1 unchanged (default 1.2)
//   photosat=x        saturation of the aerial photographs, 1 unchanged (default 1.4)
//                     (defaults chosen by the maintainer from a comparison, 2026-10-06)
//   clouds=0          leave out the clouds
//   groundshadow=0    leave out the cloud shadows on the terrain and buildings
//   cloudamount=NAME  how much cloud: few, normal (default) or many (as takram's default layers)
//   coverage=0..1     cloud coverage of all layers (default 0.3)
//   wind=E,N          wind in m/s towards the east and the north, moving the clouds, e.g.
//                     wind=10,-5 (default 0,0, as takram)
//   cloudfx=LIST      cloud feature switches, comma-separated: +NAME turns one on, -NAME off,
//                     relative to the defaults (src/clouds/clouds.ts, docs/clouds-parity.md);
//                     e.g. cloudfx=-POWDER
//   raymarch=0        look up the aerial perspective in tables instead of ray marching it
//   flare=0           leave out the lens flare
//   drops=0           leave out the water drops on the screen in clouds
//   dropsdebug        show the drops' height map in red
//   hud=0             leave out the aircraft's HUD (the speed, altitude, heading and attitude
//                     symbols)
//   huddebug          draw a test pattern on both HUD layers
//   measure           after loading, time 180 frames and report them in window.__debug
//   debug             show debug text: flight time, height, load factor, frame time; also lists
//                     where the path goes through clouds (window.__debug.pathClouds)

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export interface Params {
  area: 'tokyo' | 'hakone'
  date: Date
  flightStart: number
  paused: boolean
  /** A JSBSim path in public/paths/, or null for the placeholder racetrack. */
  path: string | null
  exposure: number
  fov: number
  lag: number
  shake: number
  shakePerG: number
  shakeInCloud: number
  sink: number
  sinkTime: number
  speed: number
  /** null: the area's default (src/areas.ts). */
  altitude: number | null
  bank: number | null
  rollRate: number
  buildings: boolean
  textures: boolean
  terrain: boolean
  terrainTexelPixels: number
  terrainDebug: 'levels' | 'unlit' | 'water' | 'plain' | 'normals' | null
  landSpecular: number
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
  drops: boolean
  dropsDebug: boolean
  hud: boolean
  hudDebug: boolean
  clouds: boolean
  groundShadow: boolean
  cloudAmount: 'few' | 'normal' | 'many'
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
  // A number, or null when absent or malformed so that a default from elsewhere applies.
  const optionalNumber = (name: string, min: number, max: number): number | null => {
    const value = number(name, Number.NaN, min, max)
    return Number.isNaN(value) ? null : value
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
    area: query.get('area') === 'tokyo' ? 'tokyo' : 'hakone',
    date,
    flightStart: number('t', 0, -1e6, 1e6),
    paused: query.has('paused'),
    path: /^[a-z0-9-]+$/.test(query.get('path') ?? '') ? query.get('path') : null,
    exposure: number('exposure', 3, 0, 1e6),
    fov: number('fov', 70, 10, 150),
    lag: number('lag', 0, 0, 10),
    shake: number('shake', 0, 0, 10),
    shakePerG: number('shakeg', 0.04, 0, 10),
    shakeInCloud: number('shakecloud', 0.3, 0, 10),
    sink: number('sink', 0, 0, 1),
    sinkTime: number('sinktime', 0.15, 0.001, 10),
    speed: number('speed', 250, 1, 1000),
    altitude: optionalNumber('altitude', 0, 20_000),
    bank: optionalNumber('bank', 1, 85),
    rollRate: number('rollrate', 90, 1, 720),
    buildings: query.get('buildings') !== '0',
    textures: query.get('textures') === '1',
    terrain: query.get('terrain') !== '0',
    terrainTexelPixels: number('terraintexel', 1.5, 0.25, 8),
    landSpecular: number('landspecular', 0, 0, 1),
    terrainDebug: ({ '1': 'levels', '2': 'unlit', '3': 'water', '4': 'plain', '5': 'normals' } as const)[query.get('terraindebug') ?? ''] ?? null,
    photoDehaze: number('photodehaze', 0.15, 0, 0.9),
    photoContrast: number('photocontrast', 1.2, 0, 4),
    photoSaturation: number('photosat', 1.4, 0, 4),
    measure: query.has('measure'),
    debugText: query.has('debug'),
    tileError: number('tileerror', 20, 0.5, 200),
    drawMode: (['batch', 'bundle', 'plain'] as const).find(m => m === query.get('draw')) ?? 'batch',
    raymarch: query.get('raymarch') !== '0',
    flare: query.get('flare') !== '0',
    drops: query.get('drops') !== '0',
    dropsDebug: query.has('dropsdebug'),
    hud: query.get('hud') !== '0',
    hudDebug: query.has('huddebug'),
    clouds: query.get('clouds') !== '0',
    groundShadow: query.get('groundshadow') !== '0',
    cloudAmount: (['few', 'normal', 'many'] as const).find(a => a === query.get('cloudamount')) ?? 'normal',
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
