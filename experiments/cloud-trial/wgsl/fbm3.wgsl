fn fbm3(p: vec3f, octaves: i32) -> f32 {
  var amplitude = 0.5;
  var sum = 0.0;
  var total = 0.0;
  var q = p;
  for (var i = 0; i < octaves; i++) {
    sum += amplitude * noise3(q);
    total += amplitude;
    q = q * 2.03 + vec3f(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return sum / total;
}
