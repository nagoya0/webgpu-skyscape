// From @takram/three-geospatial (MIT, Copyright (c) 2024 Shota Matsuda).
fn remapClamped4(x: vec4f, a: vec4f, b: vec4f) -> vec4f {
  return saturate((x - a) / max(b - a, vec4f(1e-7)));
}
