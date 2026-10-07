// One size of the baked ocean slopes (see waterNormal.wgsl), laid with hex tiling (Mikkelsen,
// "Practical Real-Time Hex-Tiling", 2022): three hexagonal tiles blend at every point, each with
// its own random offset into the texture, so the patch does not visibly repeat. The blend is
// divided by the square root of the sum of the squared weights so that it keeps the slopes'
// strength. The layer fades out where its texels would be smaller than a pixel.
//
//   p            north and east, metres
//   size         metres across one patch of the texture
//   time         seconds
//   pixelMetres  how many metres one pixel covers at this point, about
// Returns the slopes along north and east.
fn waterLayer(
  p: vec2f,
  size: f32,
  time: f32,
  pixelMetres: f32,
  slopes: texture_3d<f32>,
  slopesSampler: sampler
) -> vec2f {
  // 128 texels across the patch.
  let fade = clamp(1.5 * (size / 128.0) / pixelMetres - 0.5, 0.0, 1.0);
  if (fade <= 0.0) {
    return vec2f(0.0);
  }
  // The texture loops in 12 s for a 100 m patch; waves on a larger patch are slower by the
  // square root of the size (deep-water dispersion).
  let w = time / (12.0 * sqrt(size / 100.0));
  let uv = p / size;

  // The three hexagon centres around the point, tiles half a patch across, and their weights,
  // sharpened so that each tile keeps its own look over most of it.
  let scaled = uv * 2.0 * 3.46410162;
  let skewed = vec2f(scaled.x - 0.57735027 * scaled.y, 1.15470054 * scaled.y);
  let base = floor(skewed);
  let f = fract(skewed);
  let z = 1.0 - f.x - f.y;
  let s = step(0.0, -z);
  let s2 = 2.0 * s - 1.0;
  var weights = vec3f(-z * s2, s - f.y * s2, s - f.x * s2);
  weights = weights * weights * weights;
  weights /= weights.x + weights.y + weights.z;
  let vertices = array<vec2f, 3>(base + vec2f(s, s), base + vec2f(s, 1.0 - s), base + vec2f(1.0 - s, s));

  var sum = vec2f(0.0);
  for (var i = 0; i < 3; i++) {
    let vertex = vertices[i];
    let offset = vec2f(
      fract(sin(dot(vertex, vec2f(127.1, 311.7))) * 43758.5453),
      fract(sin(dot(vertex, vec2f(269.5, 183.3))) * 43758.5453)
    );
    let texel = textureSampleLevel(slopes, slopesSampler, vec3f(uv + offset, w), 0.0).rg;
    // Bytes 0 to 255 for slopes -0.4 to 0.4.
    sum += (texel * 255.0 - 127.5) / 127.5 * 0.4 * weights[i];
  }
  return sum / sqrt(max(dot(weights, weights), 1e-4)) * fade;
}
