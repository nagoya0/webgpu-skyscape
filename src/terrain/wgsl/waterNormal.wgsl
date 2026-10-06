// Normal of a wind-driven water surface: a sum of directional waves, given as their slopes. The
// waves flatten with distance, where they would be smaller than a pixel and only alias; the
// roughness takes over there.
//
//   position  world position (x north, y up, z east)
//   up        the surface's up direction (the geometry normal)
//   time      seconds
//   detail    0 to 1: how much of the waves to keep (1 near the camera, 0 far away)
fn waterNormal(position: vec3f, up: vec3f, time: f32, detail: f32) -> vec3f {
  let p = position.xz;
  var slope = vec2f(0.0);
  // (direction angle, wavelength in metres, steepness); waves travel along their direction at
  // the deep-water speed sqrt(g λ / 2π).
  let waves = array<vec3f, 6>(
    vec3f(0.30, 60.0, 0.10),
    vec3f(0.85, 31.0, 0.09),
    vec3f(-0.40, 17.0, 0.08),
    vec3f(1.40, 9.0, 0.07),
    vec3f(-1.10, 5.3, 0.06),
    vec3f(0.10, 2.9, 0.05)
  );
  for (var i = 0; i < 6; i++) {
    let w = waves[i];
    let direction = vec2f(cos(w.x), sin(w.x));
    let k = 6.28318530718 / w.y;
    let speed = sqrt(9.81 / k);
    let phase = k * (dot(direction, p) - speed * time);
    slope += direction * (w.z * cos(phase));
  }
  slope *= detail;
  // Build the normal around the geometry's up direction (y up locally).
  let tangent = normalize(cross(up, vec3f(0.0, 0.0, 1.0)) + vec3f(1e-6, 0.0, 0.0));
  let bitangent = cross(tangent, up);
  return normalize(up - tangent * slope.x - bitangent * slope.y);
}
