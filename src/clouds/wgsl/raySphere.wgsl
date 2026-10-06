// Distances along a ray to the near and far intersections with a sphere around the origin of
// `origin`'s frame, or (-1, -1) when the ray misses it.
fn raySphere(origin: vec3f, direction: vec3f, radius: f32) -> vec2f {
  let b = dot(origin, direction);
  let c = dot(origin, origin) - radius * radius;
  let discriminant = b * b - c;
  if (discriminant < 0.0) {
    return vec2f(-1.0);
  }
  let s = sqrt(discriminant);
  return vec2f(-b - s, -b + s);
}
