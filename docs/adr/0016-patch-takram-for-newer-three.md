# 16. Patch the takram packages to run on Three.js 0.186

- Status: Accepted
- Date: 2026-10-04
- Supersedes the version choice in [ADR 0014](0014-pin-three-and-takram-versions.md); the pinning
  rule there still applies

## Context

[ADR 0014](0014-pin-three-and-takram-versions.md) pinned Three.js to 0.184.0 because
`@takram/three-atmosphere` 0.19.1 fails to import on r185 and later. Staying on r184 had a cost:
its draw order under reversed Z is wrong, which needed a workaround of our own
([ADR 0015](0015-reversed-z-depth.md)).

The upstream fix, takram-design-engineering/three-geospatial#118, changes two files by 32 lines. It
is not merged yet, and upstream has not pushed to its main branch since May 2026.

Three ways to change library code were discussed, chosen by how much has to change:

| Size of change | Method |
|---|---|
| A small fix inside a library | `pnpm patch`: a patch file in this repository, applied on every install |
| Additions built on a library's public API | Our own modules in this repository |
| Large changes inside a library | A fork |

## Decision

- Apply the change from #118 with `pnpm patch` to the built ESM files of
  `@takram/three-atmosphere` 0.19.1 and `@takram/three-geospatial` 0.9.1 (`patches/`). The CommonJS
  builds are not patched, because Vite loads only the ESM builds.
- Upgrade to Three.js 0.186.1 and `@types/three` 0.186.0, pinned exactly.
- Added later the same day: a second change in the `@takram/three-geospatial` patch, for the
  render pipeline hooks that r186 changed. Without it, temporal anti-aliasing fails on r186. The
  details are in [docs/upgrading.md](../upgrading.md).
- Add `@takram/three-geospatial` as a direct dependency, pinned to the version the atmosphere
  package uses, because our code imports it.
- Remove the reversed-Z sort workaround. Three.js 0.186.1 draws opaque objects front to back under
  reversed Z by itself: the overdraw test from ADR 0015 took 3.6 ms per frame with reversed Z and
  4.0 ms with the standard buffer, without the workaround.
- Whether the cloud port ([ADR 0013](0013-port-the-clouds-to-tsl.md)) needs a fork is decided at
  the cloud stage, after estimating how much of the library's internals it changes.

Checked on 2026-10-04: with the patches, `@takram/three-atmosphere/webgpu` imports and renders the
sky on Three.js 0.186.1 ([experiments/atmosphere-smoke](../../experiments/atmosphere-smoke/)).

## Consequences

When #118 is released upstream, upgrade the takram packages and delete the patches. Upgrading a
patched package needs the patch to be redone or dropped. The procedure and the checks to run are
in [docs/upgrading.md](../upgrading.md).

The type declarations of the takram packages are built against `@types/three` 0.184, so some of
their types do not match 0.186. The code bridges them with type casts at the points where they
meet.
