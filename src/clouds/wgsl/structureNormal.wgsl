// The normal of the structured sampling planes for a ray direction: one of the three icosahedron
// vertices around the direction, picked by the jitter with weights that blend smoothly between
// them. Port of getIcosahedralVertices(), sortVertices(), getPentagonalWeights() and
// getStructureNormal() from @takram/three-clouds 0.7.6 (src/shaders/structuredSampling.glsl),
// MIT, Copyright (c) 2024 Shota Matsuda, after Structured Volume Sampling
// (https://github.com/huwb/volsample) and https://www.shadertoy.com/view/ttVfDc
fn structureNormal(direction: vec3f, jitter: f32) -> vec3f {
  // Normalisation to fit the dodecahedron to the unit sphere.
  let a = 0.85065080835204; // phi / sqrt(2 + phi)
  let b = 0.5257311121191336; // 1 / sqrt(2 + phi)

  // The icosahedron vertices of the triangle the direction passes through
  // (https://www.ppsloan.org/publications/AmbientDice.pdf).
  let kT = 0.6180339887498948; // 1 / phi
  let kT2 = 0.38196601125010515; // 1 / phi^2
  let absD = abs(direction);
  let selector1 = dot(absD, vec3f(1.0, kT2, -kT));
  let selector2 = dot(absD, vec3f(-kT, 1.0, kT2));
  let selector3 = dot(absD, vec3f(kT2, -kT, 1.0));
  let octantSign = sign(direction);
  var v1 = select(vec3f(-b, 0.0, a), vec3f(a, b, 0.0), selector1 > 0.0) * octantSign;
  var v2 = select(vec3f(a, -b, 0.0), vec3f(0.0, a, b), selector2 > 0.0) * octantSign;
  var v3 = select(vec3f(0.0, a, -b), vec3f(b, 0.0, a), selector3 > 0.0) * octantSign;

  // Sort the vertices in a fixed order, so the choice does not flip between neighbours.
  let base = vec3f(0.5, 0.5, 1.0);
  var aw = vec4f(v1, dot(v1, base));
  var bw = vec4f(v2, dot(v2, base));
  var cw = vec4f(v3, dot(v3, base));
  if (aw.w > bw.w) { let t = aw; aw = bw; bw = t; }
  if (bw.w > cw.w) { let t = bw; bw = cw; cw = t; }
  if (aw.w > bw.w) { let t = aw; aw = bw; bw = t; }

  // Pentagonal weights.
  let w = exp(vec3f(dot(aw.xyz, direction), dot(bw.xyz, direction), dot(cw.xyz, direction)) * 40.0);
  let weights = w / (w.x + w.y + w.z);
  if (jitter < weights.x) {
    return aw.xyz;
  }
  if (jitter < weights.x + weights.y) {
    return bw.xyz;
  }
  return cw.xyz;
}
