// Port of sampleWeather() from @takram/three-clouds 0.7.6 (src/shaders/clouds.glsl), MIT,
// Copyright (c) 2024 Shota Matsuda. Up to four layers, one per weather map channel.
// Changes: GLSL globals became parameters; the shadow branch was dropped; the weather map is
// sampled at mip level 0. Returns the height fraction of each layer in the first column and the
// coverage-modulated density of each layer in the second.
fn cloudWeather(
  uv: vec2f,
  height: f32,
  weatherTexture: texture_2d<f32>,
  weatherSampler: sampler,
  minHeights: vec4f,
  maxHeights: vec4f,
  weatherExponents: vec4f,
  shapeAlteringBiases: vec4f,
  coverage: f32,
  coverageFilterWidths: vec4f
) -> mat2x4f {
  let heightFraction = remapClamped4(vec4f(height), minHeights, maxHeights);
  let localWeather = pow(textureSampleLevel(weatherTexture, weatherSampler, uv, 0.0), weatherExponents);

  // Round the clouds towards the top with a semi-circle transform.
  let biased = pow(heightFraction, shapeAlteringBiases);
  let x = clamp(biased * 2.0 - 1.0, vec4f(-1.0), vec4f(1.0));
  let heightScale = 1.0 - x * x;

  // Coverage modulation, after Skybolt's clouds.
  let factor = 1.0 - coverage * heightScale;
  let density = remapClamped4(
    mix(localWeather, vec4f(1.0), coverageFilterWidths),
    factor,
    factor + coverageFilterWidths
  );
  return mat2x4f(heightFraction, density);
}
