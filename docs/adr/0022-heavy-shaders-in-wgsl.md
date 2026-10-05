# 22. Heavy shaders in WGSL, connected with TSL

- Status: Accepted
- Date: 2026-10-05

## Context

[ADR 0004](0004-threejs-webgpu-vite-typescript.md) planned to write shaders and post-processing
in TSL. Since then:

- this project hit two TSL changes between Three.js releases (the shape of `struct()` in r185,
  the render pipeline hooks in r186; [ADR 0016](0016-patch-takram-for-newer-three.md));
- the author of the takram packages wrote on 2026-05-28 that TSL has no clear language
  specification, with operator and type conversion behaviour depending on the implementation;
- TSL's main advantage, producing both WGSL and GLSL, is not needed: the demo is WebGPU only
  ([ADR 0003](0003-webgpu-only.md)).

A trial ([experiments/cloud-trial](../../experiments/cloud-trial/)) wrote a ray-marched cloud
layer in WGSL and connected it with Three.js `wgslFn`. Results on 2026-10-05:

- The WGSL function slots into the post-processing chain after the aerial perspective. Sun and
  sky illuminance from the atmosphere tables are computed in TSL and passed in as arguments.
- Porting from GLSL is close to mechanical: `sampleWeather` from `@takram/three-clouds`, which
  uses a texture, a sampler and a struct, compiled after turning GLSL globals into parameters,
  removing `#ifdef` branches by fixing the configuration, and renaming built-in functions.
- WGSL errors are reported by the compiler with line numbers.
- `wgslFn` expects one function per source string. A struct can share the string if it comes
  after the function, since WGSL allows module-scope declarations in any order.
- In post-processing, the camera accessors of `three/tsl` (`cameraWorldMatrix`, `cameraNear`,
  and so on) describe the full-screen quad's camera, not the scene camera. The trial first drew
  clouds that did not follow the view because of this.

## Decision

- Heavy shader code (clouds, rain, terrain detail and similar) is written in WGSL, in `.wgsl`
  files imported with Vite's `?raw`, one function per file, and connected with `wgslFn`.
- TSL is used to gather inputs and connect stages. Logic stays in WGSL.
- Post-processing stages receive the scene camera's values as explicit uniforms.
- Ported code keeps the original copyright notice in the `.wgsl` file.

## Consequences

Changes in TSL can still break the connecting code, but not the WGSL functions themselves.
Each WGSL function's inputs must be listed as parameters, which takes more wiring than TSL would.
The cloud stage ([ADR 0013](0013-port-the-clouds-to-tsl.md)) becomes a port from GLSL to WGSL,
not to TSL.
