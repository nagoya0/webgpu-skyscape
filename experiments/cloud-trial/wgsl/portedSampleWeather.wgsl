// Port test: sampleWeather() and shapeAlteringFunction() from @takram/three-clouds 0.7.6
// (src/shaders/clouds.glsl), MIT licence, Copyright (c) takram design engineering.
// Changes: GLSL globals became parameters; the SHADOW branch was dropped; the swizzle macro
// LOCAL_WEATHER_CHANNELS became .rgba; remapClamped was inlined.
//
// wgslFn parses the first declaration as the function, so the struct comes after it; WGSL
// allows module-scope declarations in any order.
fn sampleWeather(
  uv: vec2f,
  height: f32,
  mipLevel: f32,
  localWeatherTexture: texture_2d<f32>,
  localWeatherSampler: sampler,
  localWeatherRepeat: vec2f,
  localWeatherOffset: vec2f,
  minLayerHeights: vec4f,
  maxLayerHeights: vec4f,
  weatherExponents: vec4f,
  shapeAlteringBiases: vec4f,
  coverage: f32,
  coverageFilterWidths: vec4f
) -> WeatherSample {
  var weather: WeatherSample;
  weather.heightFraction = saturate((vec4f(height) - minLayerHeights) / (maxLayerHeights - minLayerHeights));

  let localWeather = pow(
    textureSampleLevel(
      localWeatherTexture,
      localWeatherSampler,
      uv * localWeatherRepeat + localWeatherOffset,
      mipLevel
    ),
    weatherExponents
  );

  // shapeAlteringFunction: a semi-circle transform to round the clouds towards the top.
  let biased = pow(weather.heightFraction, shapeAlteringBiases);
  let x = clamp(biased * 2.0 - 1.0, vec4f(-1.0), vec4f(1.0));
  let heightScale = 1.0 - x * x;

  let factor = 1.0 - coverage * heightScale;
  let value = mix(localWeather, vec4f(1.0), coverageFilterWidths);
  weather.density = saturate((value - factor) / coverageFilterWidths);
  return weather;
}

struct WeatherSample {
  heightFraction: vec4f,
  density: vec4f,
}
