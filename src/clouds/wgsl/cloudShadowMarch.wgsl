// One texel of a cloud shadow map (beer shadow map): the clouds marched from the top of the
// shadow-casting layers towards the sun's opposite direction. Port of marchClouds(),
// getRayNearFar() and cascade() from @takram/three-clouds 0.7.6 (src/shaders/shadow.frag), MIT,
// Copyright (c) 2024 Shota Matsuda.
// Changes: one cascade per call (the cascades sit side by side in one texture); world
// coordinates around the earth's centre instead of ECEF; no mip levels per cascade; no
// skipping between layers.
//
//   uv              texel centre in the cascade, origin top left
//   cascade         which cascade, 0 to 2
//   inverse0..2     each cascade's clip space to world (WebGL clip convention)
//   previous0..2    each cascade's world to clip last frame, for the velocity
//   heights         (bottom, top) of the shadow-casting layers above the sphere
//   march           (max iterations, min step, max step, optical depth tail scale)
//   mapSize         texels per cascade side
//
// Returns:
//   [0] (front distance, mean extinction, max optical depth, optical depth tail)
//   [1] (front distance, velocity u, velocity v in texels, 0)
fn cloudShadowMarch(
  uv: vec2f,
  cascade: i32,
  inverse0: mat4x4f,
  inverse1: mat4x4f,
  inverse2: mat4x4f,
  previous0: mat4x4f,
  previous1: mat4x4f,
  previous2: mat4x4f,
  sunDirection: vec3f,
  earthCenter: vec3f,
  earthRadius: f32,
  heights: vec2f,
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
  scatteringCoefficient: f32,
  march: vec4f,
  weatherOffset: vec2f,
  shapeOffset: vec3f,
  detailOffset: vec3f,
  weatherTexture: texture_2d<f32>,
  weatherSampler: sampler,
  shapeTexture: texture_3d<f32>,
  shapeSampler: sampler,
  detailTexture: texture_3d<f32>,
  detailSampler: sampler,
  jitter: f32,
  mapSize: f32
) -> mat2x4f {
  var inverseMatrix = inverse0;
  var previousMatrix = previous0;
  if (cascade == 1) { inverseMatrix = inverse1; previousMatrix = previous1; }
  if (cascade == 2) { inverseMatrix = inverse2; previousMatrix = previous2; }
  let clip = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let point = inverseMatrix * vec4f(clip, -1.0, 1.0);
  let sunPosition = point.xyz / point.w - earthCenter;
  let rayDirection = -sunDirection;

  // From the top of the shadow layers to the bottom (getRayNearFar).
  let top = raySphere(sunPosition, rayDirection, earthRadius + heights.y);
  let bottom = raySphere(sunPosition, rayDirection, earthRadius + heights.x);
  let rayNear = max(0.0, top.x);
  var rayFar = bottom.x;
  if (rayFar < 0.0) {
    rayFar = 1e6;
  }
  let rayOrigin = sunPosition + rayDirection * rayNear;
  let maxRayDistance = rayFar - rayNear;

  // Structured volume sampling: temporally stable, which matters for low-resolution shadow maps
  // where one flickering texel shows.
  let maxIterations = i32(march.x);
  let normal = structureNormal(rayDirection, jitter);
  let planes = structuredPlanes(
    normal, rayOrigin, rayDirection, clamp(maxRayDistance / march.x, march.y, march.z)
  );
  var rayDistance = planes.x;
  let stepSize = planes.y;
  #ifdef TEMPORAL_JITTER
  rayDistance -= stepSize * jitter;
  #endif // TEMPORAL_JITTER

  let evolution = length(weatherOffset) * 2e4;
  let minTransmittance = 1e-4;
  var extinctionSum = 0.0;
  var maxOpticalDepth = 0.0;
  var maxOpticalDepthTail = 0.0;
  var transmittance = 1.0;
  var weightedDistanceSum = 0.0;
  var transmittanceSum = 0.0;
  var sampleCount = 0;

  for (var i = 0; i < maxIterations; i++) {
    if (rayDistance > maxRayDistance) {
      break;
    }
    let relative = rayOrigin + rayDirection * rayDistance;
    let h = length(relative) - earthRadius;
    let p = relative + earthCenter;
    let weather = cloudWeather(
      p.xz * shape.z + weatherOffset, h, weatherTexture, weatherSampler,
      minHeights, maxHeights, weatherExponents, shapeAlteringBiases, shape.w, coverageFilterWidths
    );
    if (any(weather[1] > vec4f(1e-5))) {
      let up = normalize(relative);
      let media = cloudMedia(
        p, weather[0], weather[1],
        shapeTexture, shapeSampler, detailTexture, detailSampler,
        (p - up * evolution) * shape.x + shapeOffset, p * shape.y + detailOffset,
        shapeAmounts, detailAmounts, densityScales, profileLinear, profileConstant, scatteringCoefficient
      );
      let extinction = media.x;
      if (extinction > 1e-5) {
        extinctionSum += extinction;
        maxOpticalDepth += extinction * stepSize;
        transmittance *= exp(-extinction * stepSize);
        weightedDistanceSum += rayDistance * transmittance;
        transmittanceSum += transmittance;
        sampleCount++;
      }
    }
    if (transmittance <= minTransmittance) {
      // Much optical depth lies beyond the point of minimum transmittance; takram estimates it
      // from the number of samples taken before reaching it.
      maxOpticalDepthTail = min(
        march.w * stepSize * exp(f32(1 - sampleCount)),
        stepSize * 0.5 // more only adds aliasing
      );
      break;
    }
    rayDistance += stepSize;
  }

  var result = vec4f(maxRayDistance, 0.0, 0.0, 0.0);
  if (sampleCount > 0) {
    let frontDepth = min(weightedDistanceSum / transmittanceSum, maxRayDistance);
    result = vec4f(frontDepth, extinctionSum / f32(sampleCount), maxOpticalDepth, maxOpticalDepthTail);
  }

  // Velocity for the temporal resolve, in texels.
  var depthVelocity = vec4f(0.0);
  #ifdef TEMPORAL_PASS
  let front = rayOrigin + rayDirection * result.x + earthCenter;
  let previousClip = previousMatrix * vec4f(front, 1.0);
  let previousNdc = previousClip.xy / previousClip.w;
  let previousUv = vec2f(previousNdc.x * 0.5 + 0.5, 0.5 - previousNdc.y * 0.5);
  depthVelocity = vec4f(result.x, (uv - previousUv) * mapSize, 0.0);
  #endif // TEMPORAL_PASS

  return mat2x4f(result, depthVelocity);
}
