# Upgrading Three.js and the takram packages

What to do when upgrading `three`, `@types/three` or any `@takram/*` package. The reasons behind
the current set-up are in [ADR 0014](adr/0014-pin-three-and-takram-versions.md),
[ADR 0015](adr/0015-reversed-z-depth.md) and [ADR 0016](adr/0016-patch-takram-for-newer-three.md).

## Current state (2026-10-04)

| Package | Version | Notes |
|---|---|---|
| `three` | 0.186.1 | |
| `@types/three` | 0.186.0 | |
| `@takram/three-atmosphere` | 0.19.1 | Patched |
| `@takram/three-geospatial` | 0.9.1 | Patched. Must match the version `@takram/three-atmosphere` depends on |

All are pinned without `^`. Upgrade `three` and the takram packages together.

### Local changes that an upgrade may make unnecessary

| Change | Where | Why | Remove when |
|---|---|---|---|
| Patch for three r185+ `struct()` | `patches/@takram__three-atmosphere@0.19.1.patch` | `AtmosphereContextBase` reads `struct().layout.name`, which r185 removed; the package throws on import | A takram release contains takram-design-engineering/three-geospatial#118 |
| Patch for three r185+ `struct()` | `patches/@takram__three-geospatial@0.9.1.patch` | `FnLayout` accepts only the r184 struct shape | Same as above |
| Patch for the r186 render pipeline hooks | `patches/@takram__three-geospatial@0.9.1.patch` (`TemporalAntialiasNode.setup`) | three r186 replaced `renderPipeline.context.onBeforeRenderPipeline` with the `onBeforePipelineCallbacks` array in the builder context. Unpatched, `temporalAntialias` throws "Cannot set properties of undefined (setting 'onBeforeRenderPipeline')" and the camera jitter is never applied. No upstream issue or pull request exists for this yet (checked 2026-10-04) | A takram release registers the callback through `onBeforePipelineCallbacks` or `OnBeforeRenderPipeline()` from `three/tsl` |
| Type casts marked `TYPE-BRIDGE` | `grep -rn TYPE-BRIDGE src experiments` | takram's type declarations are built against `@types/three` 0.184 | takram's declarations match the `@types/three` in use; `pnpm tsc` passes without the casts |

Only the ESM builds (`build/webgpu.js`) are patched. The CommonJS builds are minified to one line
and Vite does not load them.

Things that were local changes before and are gone:

- A sort comparator for reversed Z (`src/render/depthSort.ts`, removed in ad15504). Three.js r184
  drew opaque objects back to front under reversed Z; r185 fixed it (mrdoob/three.js#33700). If a
  future Three.js version is slow in the overdraw check below, look here first.

## Before upgrading

1. Read the Three.js release notes for every version in between, looking for changes to TSL,
   `WebGPURenderer`, `reversedDepthBuffer` and post-processing.
2. Check whether #118 is merged and released:
   `gh pr view 118 --repo takram-design-engineering/three-geospatial` and
   `npm view @takram/three-atmosphere versions`.
3. Check which Three.js version upstream develops against: the `three` entry in the root
   `package.json` of takram-design-engineering/three-geospatial.

## Upgrading

```sh
pnpm add -E three@<version> @takram/three-atmosphere@<version> @takram/three-geospatial@<version>
pnpm add -D -E @types/three@<version>
```

`@takram/three-geospatial` must be the exact version `@takram/three-atmosphere` depends on
(`npm view @takram/three-atmosphere@<version> dependencies`).

### If a patched package changes version

`patchedDependencies` in `pnpm-workspace.yaml` names exact versions, so pnpm will report that the
patch no longer matches.

- **The new version contains #118:** delete the entry from `pnpm-workspace.yaml` and the file in
  `patches/`.
- **It does not:** redo the patch on the new version.
  1. `pnpm patch @takram/three-atmosphere@<version> --edit-dir ../patch-atmosphere`
  2. In `build/webgpu.js`, find every `<name>.layout.name` and replace it with a call to a helper
     that reads `.layout` when present and the struct itself otherwise. The old patch file shows
     the exact code.
  3. `pnpm patch-commit ../patch-atmosphere`
  4. Repeat for `@takram/three-geospatial`: in `build/webgpu.js`, before
     ``throw new Error(`Unsupported layout type: ...`)``, accept objects whose
     `isStructTypeNode` is `true` and return their `name`. In the `setup` of the temporal
     anti-aliasing node, push the view-offset callback onto
     `builder.context.onBeforePipelineCallbacks` when that array exists, and fall back to the old
     `renderPipeline.context.onBeforeRenderPipeline` otherwise.
  5. Delete the old patch files and their entries.

## Checks after upgrading

Run all of these before committing an upgrade.

```sh
pnpm install
pnpm build          # type-check and build
pnpm dev --port 4312
```

In another shell (results print as `[state]`; screenshots go where you point them):

| Check | Command | Expected |
|---|---|---|
| Atmosphere loads and renders | `WAIT=15000 node scripts/check-page.mjs "http://localhost:4312/experiments/atmosphere-smoke/" atm.png` | `debug.frames` above 0, no `[exception]`, and the screenshot shows a sky with the sun low in the west |
| Unit tests | `pnpm test` | All pass |
| Main page starts on WebGPU | `WAIT=10000 node scripts/check-page.mjs "http://localhost:4312/?time=15:00&t=5&paused" main.png` | `guidance` is `null`, `canvas` is `true`, no `[console.error]`, and the screenshot shows a level horizon over a hazy ground with a grid |
| Turn | `WAIT=10000 node scripts/check-page.mjs "http://localhost:4312/?time=15:00&t=45&paused" turn.png` | `debug.loadFactor` about 2.92; the horizon tilted steeply with the ground on the right |
| Guidance screen | `INJECT="GPU.prototype.requestAdapter = async () => null" node scripts/check-page.mjs http://localhost:4312/ guidance.png` | `guidance` holds the no-adapter message |
| Depth precision | `WAIT=6000 node scripts/check-page.mjs "http://localhost:4312/experiments/depth/?mode=reversed" depth.png` | Every square is green; no red inside the squares |
| Draw order under reversed Z | `WAIT=15000 node scripts/check-page.mjs "http://localhost:4312/experiments/depth/?mode=reversed&test=overdraw" od.png`, then the same with `mode=standard` | `msPerFrame` of reversed is about the same as standard (3.6 and 4.0 ms on the GPU used for ADR 0015). Several times slower means objects are drawn back to front again |
| Type bridges | `grep -rn TYPE-BRIDGE src experiments`, remove each cast, `pnpm tsc` | Keep only the casts that are still needed |

Then update the table under "Current state" and, if a local change was added or removed, the ADRs
that mention it.
