// How deep in cloud the aircraft is, 0 to 1, for the effects in clouds (shake now, drops on the
// screen later). It comes from the clouds' extinction at the aircraft (cloud step C5) and follows
// it smoothly, since the density jumps at a cloud's edge.

/** Extinction per metre at which the factor reaches 1 − 1/e: about 100 m of visibility. */
const EXTINCTION_SCALE = 0.01
/** Seconds to follow about 63 % of a change. */
const FOLLOW_SECONDS = 0.2

/** 0 in clear air, towards 1 in thick cloud. */
export function inCloudFactor(extinction: number): number {
  return 1 - Math.exp(-Math.max(extinction, 0) / EXTINCTION_SCALE)
}

export interface InCloud {
  /** Updates with the extinction at the aircraft; dt = 0 jumps to it (paused, first frame). */
  update(extinction: number, dt: number): number
  readonly value: number
}

export function createInCloud(): InCloud {
  let value = 0
  return {
    update(extinction, dt) {
      const target = inCloudFactor(extinction)
      value = dt > 0 ? value + (target - value) * (1 - Math.exp(-dt / FOLLOW_SECONDS)) : target
      return value
    },
    get value() {
      return value
    }
  }
}
