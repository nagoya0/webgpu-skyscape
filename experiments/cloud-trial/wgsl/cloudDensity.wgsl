// Extinction coefficient in 1/m at a world position. Trial cloud layer: flat, between base and
// top, coverage from a large-scale noise and shape from a smaller one. Real cumulus is around
// 0.05 to 0.1 per metre.
fn cloudDensity(p: vec3f, base: f32, top: f32, time: f32, octaves: i32) -> f32 {
  let h = (p.y - base) / (top - base);
  if (h < 0.0 || h > 1.0) {
    return 0.0;
  }
  let wind = vec3f(time * 8.0, 0.0, time * 3.0);
  let coverage = fbm3(vec3f((p.xz + wind.xz) * 0.00022, 0.5), 3);
  let shape = fbm3((p + wind) * 0.0011, octaves);
  // Rounded bottoms and tops.
  let profile = smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.55, h);
  let d = (coverage * 0.7 + shape * 0.5 - 0.66) * profile;
  return max(d, 0.0) * 0.6;
}
