# 32. Land reflects light diffusely (Lambertian)

- Status: Accepted
- Date: 2026-10-07

## Context

At 17:00 the maintainer saw the land reflecting the low sun strongly: a glossy sheen on the
ridges, like sand dunes. They doubted that fields and forests reflect light sharply; they scatter
it.

The terrain used three's standard material at full roughness. Such a material still reflects
light specularly at grazing angles. A search found the same problem discussed for game engine
landscapes, and measurements of vegetation from satellites: forests and fields are brightest with
the sun behind the viewer, where their shadows are hidden, and darker towards the sun. Their
reflection is treated as volume scattering with shadows, not as a specular surface; sharp
reflections of the sun come from water and wet surfaces.

Lowering the specular intensity of three's physical material to 0 was not enough: its direct
light keeps a specular reflectance of 1 at grazing angles whatever the intensity.

## Decision

- Land reflects light diffusely only (Lambertian). The maintainer compared 17:00 and 15:00 with
  and without and judged the diffuse land clearly more real.
- Water keeps its specular reflection: the sun's glint and the sky (ADR 0029).
- The specular intensity of land can be changed with `?landspecular=0..1` (default 0); 1 is the
  standard material's reflection as before.

## Consequences

The sheen on the ridges at low sun is gone. On the south slopes at 15:00 the texture of the trees
shows; before, the sheen lay over the photograph as a whitish film, which made those slopes look
flat.

### Implementation details, not discussed

- The terrain material (`src/terrain/terrainMaterial.ts`) is three's physical material with the
  direct light's specular term scaled by the reflectance at grazing angles, which for a non-metal
  is the specular intensity. At 0 that leaves only the diffuse term, at 1 it is unchanged. Values
  in between weaken the reflection more than in proportion.
- One material serves land and water within a tile (the water mask); three's Lambert material
  was not used because the land in tiles with water would then be shaded differently from the
  land in tiles without.
