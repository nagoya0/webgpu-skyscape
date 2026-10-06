// WebGPU-only start-up check (ADR 0003). Three.js would otherwise fall back to
// WebGL 2 without telling us, so the device is created here and handed to it.

/** Features the renderer cannot work without. Add to this as stages are added. */
export const REQUIRED_FEATURES: readonly GPUFeatureName[] = ['float32-filterable']

/**
 * Limits the renderer needs above the WebGPU defaults. The cloud pass writes three 32-bit RGBA
 * targets at once (src/clouds/cloudsNode.ts), 48 bytes per sample where the default allows 32.
 */
export const REQUIRED_LIMITS: Readonly<Record<string, number>> = {
  maxColorAttachmentBytesPerSample: 48
}

/**
 * Limits asked for up to these values when the adapter allows, without failing if it does not.
 * The batched building geometry (src/scene/tileBatcher.ts) outgrows the default 256 MiB per
 * buffer.
 */
export const DESIRED_LIMITS: Readonly<Record<string, number>> = {
  maxBufferSize: 1024 * 1024 * 1024,
  maxStorageBufferBindingSize: 1024 * 1024 * 1024
}

export type SupportResult =
  | { ok: true; device: GPUDevice; adapterInfo: GPUAdapterInfo }
  | { ok: false; reason: string; details: string[] }

export async function requestDevice(): Promise<SupportResult> {
  if (!('gpu' in navigator)) {
    return {
      ok: false,
      reason: 'This browser does not provide WebGPU.',
      details: []
    }
  }

  let adapter: GPUAdapter | null = null
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  } catch (error) {
    return { ok: false, reason: 'Requesting a GPU adapter failed.', details: [String(error)] }
  }
  if (adapter === null) {
    return {
      ok: false,
      reason:
        'WebGPU is present, but no GPU adapter is available. It may be disabled in the browser settings, or the GPU or its driver may not be supported.',
      details: []
    }
  }

  const missingFeatures = REQUIRED_FEATURES.filter(name => !adapter.features.has(name))
  const missingLimits = Object.entries(REQUIRED_LIMITS)
    .filter(([name, value]) => {
      const available = (adapter.limits as unknown as Record<string, number>)[name]
      return available === undefined || available < value
    })
    .map(([name, value]) => `${name} ≥ ${value}`)
  if (missingFeatures.length > 0 || missingLimits.length > 0) {
    return {
      ok: false,
      reason: 'The GPU adapter lacks features this demo needs.',
      details: [
        ...missingFeatures.map(name => `Feature: ${name}`),
        ...missingLimits.map(limit => `Limit: ${limit}`)
      ]
    }
  }

  try {
    // Ask for everything the adapter offers, as Three.js does, so that optional
    // features such as timestamp queries stay available.
    const adapterLimits = adapter.limits as unknown as Record<string, number>
    const requiredLimits: Record<string, number> = { ...REQUIRED_LIMITS }
    for (const [name, value] of Object.entries(DESIRED_LIMITS)) {
      const available = adapterLimits[name]
      if (available !== undefined) requiredLimits[name] = Math.min(value, available)
    }
    const device = await adapter.requestDevice({
      requiredFeatures: [...adapter.features] as GPUFeatureName[],
      requiredLimits
    })
    return { ok: true, device, adapterInfo: adapter.info }
  } catch (error) {
    return { ok: false, reason: 'Creating the GPU device failed.', details: [String(error)] }
  }
}
