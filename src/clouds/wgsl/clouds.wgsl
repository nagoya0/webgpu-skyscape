// Ray-marched cloud layers composited over the scene. Port of marchClouds() and parts of main()
// from @takram/three-clouds 0.7.6 (src/shaders/clouds.frag), MIT, Copyright (c) 2024 Shota
// Matsuda. takram's feature switches are kept as preprocessor blocks (src/shaders/preprocess.ts);
// which takram features are ported is tracked in docs/clouds-parity.md.
//
// The layers are spherical shells around the earth's centre, given in world coordinates, so
// they follow the curvature of the earth to the horizon.
//
//   color          scene colour after the aerial perspective (HDR luminance)
//   viewZ          view-space z of the scene at this pixel (negative); very large for the sky
//   uv             screen UV, origin top left
//   sunE, skyE     sun and sky illuminance at the clouds, from the atmosphere tables
//   layers         heights: minHeights, maxHeights
//   shape          (shape repeat, detail repeat, weather repeat, coverage) per metre
//   light          (scattering coefficient, powder scale, powder exponent, sky light scale)
//   phase          (g1, g2, second lobe mix, unused)
//   march          (min step, max step, perspective step scale, max distance)
//   offsets        (weather offset u, weather offset v, shape offset x, shape offset z)
fn clouds(
  color: vec4f,
  viewZ: f32,
  uv: vec2f,
  projectionInverse: mat4x4f,
  cameraWorld: mat4x4f,
  sunDirection: vec3f,
  sunE: vec3f,
  skyE: vec3f,
  earthCenter: vec3f,
  earthRadius: f32,
  minHeights: vec4f,
  maxHeights: vec4f,
  densityScales: vec4f,
  shapeAmounts: vec4f,
  detailAmounts: vec4f,
  weatherExponents: vec4f,
  shapeAlteringBiases: vec4f,
  coverageFilterWidths: vec4f,
  profileLinear: vec4f,
  profileConstant: vec4f,
  shape: vec4f,
  light: vec4f,
  phase: vec4f,
  march: vec4f,
  offsets: vec4f,
  weatherTexture: texture_2d<f32>,
  weatherSampler: sampler,
  shapeTexture: texture_3d<f32>,
  shapeSampler: sampler,
  detailTexture: texture_3d<f32>,
  detailSampler: sampler,
  frame: f32
) -> vec4f {
  // Ray in view space, then world space.
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.5, 1.0);
  let viewPoint = projectionInverse * ndc;
  let directionView = normalize(viewPoint.xyz / viewPoint.w);
  let origin = cameraWorld[3].xyz;
  let direction = normalize((cameraWorld * vec4f(directionView, 0.0)).xyz);
  let sceneDistance = -viewZ / max(-directionView.z, 1e-4);

  // Layer shells relative to the earth's centre.
  let bottom = min(min(minHeights.x, minHeights.y), min(minHeights.z, minHeights.w));
  let top = max(max(maxHeights.x, maxHeights.y), max(maxHeights.z, maxHeights.w));
  let relative = origin - earthCenter;
  let height = length(relative) - earthRadius;
  let inner = raySphere(relative, direction, earthRadius + bottom);
  let outer = raySphere(relative, direction, earthRadius + top);
  let ground = raySphere(relative, direction, earthRadius);

  var near = 0.0;
  var far = 0.0;
  if (height < bottom) {
    // Below the clouds: from leaving the inner shell to leaving the outer one, unless the ground
    // comes first.
    if (ground.x > 0.0) {
      return color;
    }
    near = inner.y;
    far = outer.y;
  } else if (height < top) {
    near = 0.0;
    far = select(outer.y, inner.x, inner.x > 0.0);
  } else {
    if (outer.x < 0.0) {
      return color;
    }
    near = outer.x;
    far = select(outer.y, inner.x, inner.x > 0.0);
  }
  far = min(min(far, sceneDistance), march.w);
  if (far <= near) {
    return color;
  }

  let cosTheta = dot(direction, sunDirection);
  // Per pixel and per frame, so temporal anti-aliasing averages the sampling noise.
  let jitter = fract(
    sin(dot(uv * 1024.0 + vec2f(frame * 0.61803, frame * 0.41421), vec2f(12.9898, 78.233))) *
      43758.5453
  );

  let minStep = march.x;
  let maxStep = march.y;
  let stepScale = march.z;
  var stepSize = minStep + (stepScale - 1.0) * near;
  var t = stepSize * jitter * 2.0;
  let span = far - near;

  var radianceIntegral = vec3f(0.0);
  var transmittance = 1.0;
  let minTransmittance = 0.01;

  for (var i = 0; i < 160; i++) {
    if (t > span) {
      break;
    }
    let distance = near + t;
    let p = origin + direction * distance;
    let h = length(p - earthCenter) - earthRadius;
    let weatherUv = p.xz * shape.z + offsets.xy;
    let weather = cloudWeather(
      weatherUv, h, weatherTexture, weatherSampler,
      minHeights, maxHeights, weatherExponents, shapeAlteringBiases, shape.w, coverageFilterWidths
    );
    // Far away, step longer: the detail is below a pixel there anyway.
    let farness = min(1.0, log2(1.0 + distance * 1e-5));
    if (!any(weather[1] > vec4f(1e-5))) {
      stepSize *= stepScale;
      t += mix(stepSize, maxStep, farness);
      continue;
    }

    let shapeOffset = vec3f(offsets.z, 0.0, offsets.w);
    let media = cloudMedia(
      p, weather[0], weather[1],
      shapeTexture, shapeSampler, detailTexture, detailSampler,
      (p + shapeOffset) * shape.x, p * shape.y,
      shapeAmounts, detailAmounts, densityScales, profileLinear, profileConstant, light.x
    );
    let extinction = media.x;

    if (extinction > 1e-5) {
      // Optical depth towards the sun, two growing steps.
      var opticalDepth = 0.0;
      var sunStep = 50.0;
      var sunDistance = sunStep * jitter;
      for (var j = 0; j < 2; j++) {
        let q = p + sunDirection * sunDistance;
        let hq = length(q - earthCenter) - earthRadius;
        let wq = cloudWeather(
          q.xz * shape.z + offsets.xy, hq, weatherTexture, weatherSampler,
          minHeights, maxHeights, weatherExponents, shapeAlteringBiases, shape.w, coverageFilterWidths
        );
        let mq = cloudMedia(
          q, wq[0], wq[1],
          shapeTexture, shapeSampler, detailTexture, detailSampler,
          (q + shapeOffset) * shape.x, q * shape.y,
          shapeAmounts, detailAmounts, densityScales, profileLinear, profileConstant, light.x
        );
        opticalDepth += mq.x * sunStep;
        sunDistance += sunStep;
        sunStep *= 2.0;
      }

      var radiance = sunE * cloudMultipleScattering(opticalDepth, cosTheta, phase.xyz);
      radiance += skyE * 0.07957747 * media.y * light.w;
      radiance *= extinction; // scattering equals extinction without absorption
      #ifdef POWDER
      radiance *= 1.0 - light.y * exp(-extinction * light.z);
      #endif // POWDER

      // Energy-conserving integration over the step (Frostbite 2016, 5.6.3).
      let stepTransmittance = exp(-extinction * stepSize);
      radianceIntegral += transmittance * (radiance - radiance * stepTransmittance) / max(extinction, 1e-7);
      transmittance *= stepTransmittance;
    }

    if (transmittance <= minTransmittance) {
      break;
    }
    stepSize *= stepScale;
    t += stepSize;
  }

  let alpha = saturate((transmittance - 1.0) / (minTransmittance - 1.0));
  return vec4f(color.rgb * (1.0 - alpha) + radianceIntegral, color.a);
}
