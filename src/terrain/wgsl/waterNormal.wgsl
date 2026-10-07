// Normal of a wind-driven water surface from baked FFT ocean slopes (tools/water/bake_ocean.py):
// a 3D texture of slopes over a repeating patch (x north, y east) and a looping time (z).
// Sums of a few directional waves showed straight stripes crossing each other from low over the
// sea; the FFT ocean's many random waves do not. The texture is used at three sizes, a swell and
// the waves on it (waterLayer.wgsl); the middle one keeps waves on the sea beyond about 1.5 km,
// where the smallest has faded out.
//
//   position     world position (x north, y up, z east)
//   up           the surface's up direction (the geometry normal)
//   time         seconds
//   pixelMetres  how many metres one pixel covers at this point, about
fn waterNormal(
  position: vec3f,
  up: vec3f,
  time: f32,
  pixelMetres: f32,
  slopes: texture_3d<f32>,
  slopesSampler: sampler
) -> vec3f {
  let p = position.xz;
  var slope = vec2f(0.0);
  slope += 0.6 * waterLayer(p, 512.0, time, pixelMetres, slopes, slopesSampler);
  slope += 0.8 * waterLayer(p, 170.0, time, pixelMetres, slopes, slopesSampler);
  slope += 0.8 * waterLayer(p, 53.0, time, pixelMetres, slopes, slopesSampler);
  // Build the normal around the geometry's up direction (y up locally).
  let tangent = normalize(cross(up, vec3f(0.0, 0.0, 1.0)) + vec3f(1e-6, 0.0, 0.0));
  let bitangent = cross(tangent, up);
  return normalize(up - tangent * slope.x - bitangent * slope.y);
}
