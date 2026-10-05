# 27. Building tiles are drawn as one BatchedMesh

- Status: Accepted
- Date: 2026-10-06

## Context

With about a thousand PLATEAU tile meshes on screen
([ADR 0024](0024-untextured-buildings-with-procedural-facades.md)), encoding one draw call per
mesh took most of the frame's JavaScript time. 3DTilesRendererJS has a `BatchedTilesPlugin`, but
it uses the WebGL context and GLSL and does not run on WebGPU.

Measured on 2026-10-06 with `?measure`, 1902 × 984, paused over the buildings at t = 5 s, on the
development machine (RTX 4070):

| Building tiles drawn as | JavaScript per frame | GPU per frame |
|---|---|---|
| One draw call per mesh, error target 6 | about 9 ms | not measured |
| One draw call per mesh, error target 20 | 7.2 ms | not measured |
| A render bundle (`BundleGroup`) | 5.1 to 5.5 ms | 4.3 ms |
| One `BatchedMesh` | 3.3 to 3.7 ms | 3.5 ms |

GPU time comes from timestamp queries. Turning them on slows the JavaScript side (3.3 ms becomes
7.8 ms with the batch), so JavaScript times are read from runs without them. An earlier "total"
figure, which waited for the GPU after every frame, included about 3 ms of round-trip waiting
and overstated the cost: the sky alone showed 4.4 ms in total but 1.1 ms of GPU work.

## Decision

- Untextured building tiles are drawn as one `BatchedMesh` with the shared facade material
  (`src/scene/tileBatcher.ts`). Each tile mesh becomes one geometry and one instance; tile
  visibility from the tiles renderer switches instances on and off.
- Instance matrices are computed on the CPU in 64 bits, from ECEF to the local frame
  ([ADR 0017](0017-local-world-frame.md)). Passing ECEF matrices to the GPU would leave the
  buildings jittering by about half a metre.
- The building tile error target is 20 pixels instead of 6: no visible difference, about half the
  meshes.
- `?draw=bundle` and `?draw=plain` keep the other two ways for comparison.

Two workarounds for Three.js 0.186:

- The instance count is fixed at 8,192 and never grown. Three.js keeps the previous frame's
  instance matrices for motion vectors in a texture sized when the mesh is first drawn; growing
  the instance count later overruns it ("RangeError: offset is out of bounds").
- The `BatchedMesh` joins the scene only after its first geometry is added. Its vertex attributes
  are created by the first `addGeometry`; a pipeline built while it is empty lacks them and keeps
  drawing nothing ("Vertex attribute 'position' not found").

## Consequences

- On the development machine the whole scene (sky, terrain, buildings) takes about 3.5 ms of GPU
  and about 3.3 ms of JavaScript per frame. A browser overlaps the two, so against the 7 ms
  budget of [ADR 0025](0025-target-hardware.md) there is room left, for the clouds above all.
- All loaded building tiles, not only visible ones, sit in the batch's buffers: about 340 MB for
  about 800 tiles. The device asks for buffers of up to 1 GiB where the adapter allows
  (`src/gpu/support.ts`), above WebGPU's default of 256 MiB. The tile cache for untextured
  tiles is 0.6 GB.
- Textured tiles (`?textures=1`) cannot be batched with one material and keep one draw call per
  mesh.
