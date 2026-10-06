// Variance clipping of a history colour against the current colour and its four neighbours.
// Port of varianceClipping() (the UV variant, four neighbours) from @takram/three-clouds 0.7.6
// (src/shaders/varianceClipping.glsl), MIT, Copyright (c) 2024 Shota Matsuda, after
// https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf
//
//   uv     where to sample inputTexture; texel is the size of one of its texels in UV
fn varianceClipping(
  inputTexture: texture_2d<f32>,
  inputSampler: sampler,
  uv: vec2f,
  texel: vec2f,
  current: vec4f,
  history: vec4f,
  gamma: f32
) -> vec4f {
  let a = textureSampleLevel(inputTexture, inputSampler, uv + vec2f(texel.x, 0.0), 0.0);
  let b = textureSampleLevel(inputTexture, inputSampler, uv - vec2f(0.0, texel.y), 0.0);
  let c = textureSampleLevel(inputTexture, inputSampler, uv + vec2f(0.0, texel.y), 0.0);
  let d = textureSampleLevel(inputTexture, inputSampler, uv - vec2f(texel.x, 0.0), 0.0);
  let moment1 = current + a + b + c + d;
  let moment2 = current * current + a * a + b * b + c * c + d * d;
  let mean = moment1 / 5.0;
  let deviation = sqrt(max(moment2 / 5.0 - mean * mean, vec4f(0.0))) * gamma;
  let minColor = mean - deviation;
  let maxColor = mean + deviation;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}
