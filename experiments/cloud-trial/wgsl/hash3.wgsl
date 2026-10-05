fn hash3(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.11, 0.17, 0.13)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
