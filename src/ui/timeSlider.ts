// A time-of-day slider in Japan Standard Time. The date is fixed; only the time of day moves.

const JST_OFFSET_MINUTES = 9 * 60

export interface TimeSlider {
  /** The current time. */
  date(): Date
}

/**
 * @param day Any moment on the day to use, in JST.
 * @param initialMinutes Minutes after midnight JST.
 */
export function createTimeSlider(
  parent: HTMLElement,
  day: Date,
  initialMinutes: number,
  onChange: (date: Date) => void
): TimeSlider {
  // Midnight JST of the given day, in UTC milliseconds.
  const jst = new Date(day.getTime() + JST_OFFSET_MINUTES * 60_000)
  const midnight =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) -
    JST_OFFSET_MINUTES * 60_000
  const dateLabel = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`

  const container = document.createElement('div')
  container.className = 'time-slider'
  const input = document.createElement('input')
  input.type = 'range'
  input.min = '0'
  input.max = String(24 * 60 - 1)
  input.step = '1'
  input.value = String(initialMinutes)
  input.setAttribute('aria-label', 'Time of day (JST)')
  const label = document.createElement('output')
  container.append(input, label)
  parent.appendChild(container)

  const current = (): Date => new Date(midnight + Number(input.value) * 60_000)
  const update = (): void => {
    const minutes = Number(input.value)
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    label.textContent = `${dateLabel} ${hh}:${mm} JST`
    onChange(current())
  }
  input.addEventListener('input', update)
  update()

  return { date: current }
}
