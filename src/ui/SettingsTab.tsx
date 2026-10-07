// The settings tab of the settings window (ADR 0037). Every setting applies at once.
import type { Signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'

import { flightDuration, flightTime, fromJst, jstParts, live, seekTo, type CloudAmount } from './settings'

export function SettingsTab() {
  const { day, time } = jstParts(live.date.value)
  const setDate = (nextDay: string, nextTime: string) => {
    const date = fromJst(nextDay, nextTime)
    if (date) live.date.value = date
  }
  return (
    <div class="settings">
      <Group title="シーン">
        <Row label="日付">
          <input type="date" class="field" value={day} onChange={event => setDate(event.currentTarget.value, time)} />
        </Row>
        <Row label="時刻">
          {/* A field like the date's (the maintainer's request); the sky follows as it changes. */}
          <input type="time" class="field" value={time} onInput={event => setDate(day, event.currentTarget.value)} />
        </Row>
      </Group>

      <Group title="飛行">
        <Row label="一時停止">
          <Toggle signal={live.paused} label="一時停止" />
        </Row>
        <Row label="コース行程">
          <input
            type="range"
            min={0}
            max={flightDuration.value}
            step={0.1}
            value={lapTime()}
            aria-label="コース行程"
            onInput={event => {
              const t = Number(event.currentTarget.value)
              seekTo.value = t
              flightTime.value = t
            }}
          />
        </Row>
      </Group>

      <Group title="表示">
        <Row label="HUD">
          <Toggle signal={live.hud} label="HUD" />
        </Row>
      </Group>

      <Group title="雲">
        {/* Labels chosen by the maintainer: the cloud amount (ADR 0033) mostly changes how large
            the clouds are, and the coverage how much of the sky they cover (雲量, cloud cover). */}
        <Row label="雲の大きさ">
          <Choice
            signal={live.cloudAmount}
            options={[
              ['few', '小さい'],
              ['normal', '普通'],
              ['many', '大きい']
            ]}
          />
        </Row>
        <Row label="雲の量">
          {/* No number: the coverage is a threshold, not the share of the sky the name suggests. */}
          <Slider signal={live.coverage} min={0} max={1} step={0.01} label="雲の量" />
        </Row>
      </Group>

      <Group title="デバッグ">
        <Row label="デバッグ表示">
          <Toggle signal={live.debug} label="デバッグ表示" />
        </Row>
      </Group>
    </div>
  )
}

/** The flight time within the lap; the flight time keeps growing as the course loops. */
function lapTime(): number {
  const duration = flightDuration.value
  return duration > 0 ? ((flightTime.value % duration) + duration) % duration : 0
}

function Group(props: { title: string; children: ComponentChildren }) {
  return (
    <section class="settings-group">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  )
}

function Row(props: { label: string; children: ComponentChildren }) {
  return (
    <div class="settings-row">
      <span class="settings-label">{props.label}</span>
      <span class="settings-control">{props.children}</span>
    </div>
  )
}

/** A switch. */
function Toggle(props: { signal: Signal<boolean>; label: string }) {
  const on = props.signal.value
  return (
    <button
      type="button"
      role="switch"
      class="switch"
      aria-checked={on}
      aria-label={props.label}
      onClick={() => (props.signal.value = !props.signal.value)}
    >
      <span class="switch-knob" />
    </button>
  )
}

/** A slider, without a number. */
function Slider(props: { signal: Signal<number>; min: number; max: number; step: number; label: string }) {
  return (
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.signal.value}
      aria-label={props.label}
      onInput={event => (props.signal.value = Number(event.currentTarget.value))}
    />
  )
}

function Choice(props: { signal: Signal<CloudAmount>; options: [CloudAmount, string][] }) {
  return (
    <span class="choice" role="radiogroup">
      {props.options.map(([value, label]) => (
        <button
          type="button"
          role="radio"
          class="choice-option"
          aria-checked={props.signal.value === value}
          onClick={() => (props.signal.value = value)}
        >
          {label}
        </button>
      ))}
    </span>
  )
}
