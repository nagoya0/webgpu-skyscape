// WebGPU-only start-up check (ADR 0003). Three.js would otherwise fall back to
// WebGL 2 without telling us, so the device is created here and handed to it.
import type { GuidanceKind } from '../ui/GuidanceScreen'

/** Features the renderer cannot work without. Add to this as stages are added. */
export const REQUIRED_FEATURES: readonly GPUFeatureName[] = ['float32-filterable']

/**
 * Limits the renderer needs above the WebGPU defaults. The cloud pass writes three 32-bit RGBA
 * targets at once (src/clouds/cloudsNode.ts), 48 bytes per sample where the default allows 32.
 */
export const REQUIRED_LIMITS: Readonly<Record<string, number>> = {
  maxColorAttachmentBytesPerSample: 48
}

export type SupportResult =
  | { ok: true; device: GPUDevice; adapterInfo: GPUAdapterInfo }
  | { ok: false; kind: GuidanceKind; details: string[] }

export async function requestDevice(): Promise<SupportResult> {
  if (!('gpu' in navigator)) {
    return { ok: false, kind: 'no-webgpu', details: [] }
  }

  let adapter: GPUAdapter | null = null
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  } catch (error) {
    return { ok: false, kind: 'no-adapter', details: [`requestAdapter: ${String(error)}`] }
  }
  if (adapter === null) {
    return { ok: false, kind: 'no-adapter', details: [] }
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
      kind: 'missing-features',
      details: [
        ...missingFeatures.map(name => `Feature: ${name}`),
        ...missingLimits.map(limit => `Limit: ${limit}`)
      ]
    }
  }

  try {
    // Ask for everything the adapter offers, as Three.js does, so that optional
    // features such as timestamp queries stay available.
    const device = await adapter.requestDevice({
      requiredFeatures: [...adapter.features] as GPUFeatureName[],
      requiredLimits: { ...REQUIRED_LIMITS }
    })
    return { ok: true, device, adapterInfo: adapter.info }
  } catch (error) {
    return { ok: false, kind: 'renderer-failed', details: [`requestDevice: ${String(error)}`] }
  }
}
