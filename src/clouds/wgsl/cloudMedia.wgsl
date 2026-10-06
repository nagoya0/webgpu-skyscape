// Port of sampleMedia() from @takram/three-clouds 0.7.6 (src/shaders/clouds.glsl), MIT,
// Copyright (c) 2024 Shota Matsuda.
// Changes: GLSL globals became parameters; the caller computes the shape and detail positions,
// with the offsets and the evolution along the surface normal; no turbulence; shape detail, when SHAPE_DETAIL is defined, is always sampled rather than by mip
// level; the density profile has no exponential term; no absorption, so extinction equals
// scattering. Returns (extinction per metre, sky gradient).
fn cloudMedia(
  position: vec3f,
  heightFraction: vec4f,
  weatherDensity: vec4f,
  shapeTexture: texture_3d<f32>,
  shapeSampler: sampler,
  detailTexture: texture_3d<f32>,
  detailSampler: sampler,
  shapePosition: vec3f,
  detailPosition: vec3f,
  shapeAmounts: vec4f,
  detailAmounts: vec4f,
  densityScales: vec4f,
  profileLinear: vec4f,
  profileConstant: vec4f,
  scatteringCoefficient: f32
) -> vec2f {
  let shape = textureSampleLevel(shapeTexture, shapeSampler, shapePosition, 0.0).r;
  var density = remapClamped4(weatherDensity, vec4f(1.0 - shape) * shapeAmounts, vec4f(1.0));

  #ifdef SHAPE_DETAIL
  let detail = textureSampleLevel(detailTexture, detailSampler, detailPosition, 0.0).r;
  // Fluffy at the top and whippy at the bottom.
  var modifier = mix(
    vec4f(pow(detail, 6.0)),
    vec4f(1.0 - detail),
    remapClamped4(heightFraction, vec4f(0.2), vec4f(0.4))
  );
  modifier = mix(vec4f(0.0), modifier, detailAmounts);
  density = remapClamped4(density * 2.0, modifier * 0.5, vec4f(1.0));
  #endif // SHAPE_DETAIL

  // Density profile over each layer's height.
  density = saturate(density * densityScales * (profileLinear * heightFraction + profileConstant));

  let sum = density.x + density.y + density.z + density.w;
  let weight = density / max(sum, 1e-7);
  // Crude approximation of the sky gradient, used for the sky light.
  let skyGradient = dot(heightFraction * 0.5 + 0.5, weight);
  return vec2f(sum * scatteringCoefficient, skyGradient);
}
