// Ray-marched cloud layers for one pixel. Port of marchClouds() and parts of main() from
// @takram/three-clouds 0.7.6 (src/shaders/clouds.frag), MIT, Copyright (c) 2024 Shota Matsuda.
// takram's feature switches are kept as preprocessor blocks (src/shaders/preprocess.ts); which
// takram features are ported is tracked in docs/clouds-parity.md.
//
// The layers are spherical shells around the earth's centre, given in world coordinates, so
// they follow the curvature of the earth to the horizon.
//
//   viewZ          view-space z of the scene at this pixel (negative); very large for the sky
//   uv             screen UV of the pixel centre, origin top left
//   previousViewProjection  last frame's projection × view matrix, for the velocity
//   sunE0, skyE0   sun and sky illuminance at the bottom of the cloud layers above the camera,
//   sunE1, skyE1   and at their top, from the atmosphere tables; interpolated by height as in
//                  takram (without ACCURATE_SUN_SKY_LIGHT)
//   layers         heights: minHeights, maxHeights
//   shape          (shape repeat, detail repeat, weather repeat, coverage) per metre
//   light          (scattering coefficient, powder scale, powder exponent, sky light scale)
//   phase          (g1, g2, second lobe mix, unused)
//   march          (min step, max step, perspective step scale, max distance)
//   weatherOffset  added to the weather map UV (in tiles); its length also drives the evolution
//   shapeOffset, detailOffset  added to the shape and detail texture coordinates
//   jitter         0 to 1, blue noise per pixel and frame
//   shadow...      the cloud shadow maps and their cascades, for the optical depth to the sun
//                  beyond the marched sun ray (cloudShadowOpticalDepth.wgsl)
//   pixel          full-resolution pixel, for the shadow filter's rotation
//   shadowLengthMarch  (min step, max iterations, max distance, unused) for the light shafts
//   hazeTopHeight  top of the haze above the sphere
//
// Returns columns:
//   [0] cloud radiance (premultiplied) and opacity, before the aerial perspective
//   [1] (front distance, velocity u, velocity v, 0): the distance to the clouds' front, or to
//       the scene where there are no clouds; the velocity is this frame's UV minus last frame's
//   [2] (ray direction in world space, haze end) for the aerial perspective and the haze
//   [3] (shadow length, shadow start, haze start, 0) in metres: how much of the view ray lies in
//       cloud shadow and where that stretch starts, for the light shafts (SHADOW_LENGTH); and
//       where the view ray enters the haze
fn clouds(
  viewZ: f32,
  uv: vec2f,
  projectionInverse: mat4x4f,
  cameraWorld: mat4x4f,
  previousViewProjection: mat4x4f,
  sunDirection: vec3f,
  sunE0: vec3f,
  skyE0: vec3f,
  sunE1: vec3f,
  skyE1: vec3f,
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
  viewMatrix: mat4x4f,
  shadowMatrix0: mat4x4f,
  shadowMatrix1: mat4x4f,
  shadowMatrix2: mat4x4f,
  shadowIntervalsA: vec4f,
  shadowIntervalsB: vec4f,
  shadowCascadeCount: i32,
  cameraNear: f32,
  shadowFar: f32,
  shadowTexture: texture_2d<f32>,
  shadowSampler: sampler,
  shadowMapSize: f32,
  shadowTopHeight: f32,
  pixel: vec2f,
  shadowLengthMarch: vec4f,
  hazeTopHeight: f32
) -> mat4x4f {
  // Ray in view space, then world space.
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.5, 1.0);
  let viewPoint = projectionInverse * ndc;
  let directionView = normalize(viewPoint.xyz / viewPoint.w);
  let origin = cameraWorld[3].xyz;
  let direction = normalize((cameraWorld * vec4f(directionView, 0.0)).xyz);
  let sceneDistance = min(-viewZ / max(-directionView.z, 1e-4), 1e8);

  // Layer shells relative to the earth's centre.
  let bottom = min(min(minHeights.x, minHeights.y), min(minHeights.z, minHeights.w));
  let top = max(max(maxHeights.x, maxHeights.y), max(maxHeights.z, maxHeights.w));
  let relative = origin - earthCenter;
  let height = length(relative) - earthRadius;
  let inner = raySphere(relative, direction, earthRadius + bottom);
  let outer = raySphere(relative, direction, earthRadius + top);
  let ground = raySphere(relative, direction, earthRadius);

  var near = 0.0;
  var far = -1.0;
  if (height < bottom) {
    // Below the clouds: from leaving the inner shell to leaving the outer one, unless the ground
    // comes first.
    if (ground.x <= 0.0) {
      near = inner.y;
      far = outer.y;
    }
  } else if (height < top) {
    near = 0.0;
    far = select(outer.y, inner.x, inner.x > 0.0);
  } else if (outer.x >= 0.0) {
    near = outer.x;
    far = select(outer.y, inner.x, inner.x > 0.0);
  }
  far = min(min(far, sceneDistance), march.w);

  var radianceIntegral = vec3f(0.0);
  var transmittance = 1.0;
  let minTransmittance = 0.01;
  var weightedDistanceSum = 0.0;
  var transmittanceSum = 0.0;

  // takram's evolution: the shape moves down along the surface normal as the weather moves, so
  // the clouds change shape instead of only drifting.
  let evolution = length(weatherOffset) * 2e4;

  if (far > near) {
    let cosTheta = dot(direction, sunDirection);
    let minStep = march.x;
    let maxStep = march.y;
    let stepScale = march.z;
    var stepSize = minStep + (stepScale - 1.0) * near;
    var t = stepSize * jitter * 2.0;
    let span = far - near;

    for (var i = 0; i < 160; i++) {
      if (t > span) {
        break;
      }
      let distance = near + t;
      let p = origin + direction * distance;
      let h = length(p - earthCenter) - earthRadius;
      let weatherUv = p.xz * shape.z + weatherOffset;
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

      let normal = normalize(p - earthCenter);
      let media = cloudMedia(
        p, weather[0], weather[1],
        shapeTexture, shapeSampler, detailTexture, detailSampler,
        (p - normal * evolution) * shape.x + shapeOffset, p * shape.y + detailOffset,
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
            q.xz * shape.z + weatherOffset, hq, weatherTexture, weatherSampler,
            minHeights, maxHeights, weatherExponents, shapeAlteringBiases, shape.w, coverageFilterWidths
          );
          let mq = cloudMedia(
            q, wq[0], wq[1],
            shapeTexture, shapeSampler, detailTexture, detailSampler,
            (q - normal * evolution) * shape.x + shapeOffset, q * shape.y + detailOffset,
            shapeAmounts, detailAmounts, densityScales, profileLinear, profileConstant, light.x
          );
          opticalDepth += mq.x * sunStep;
          sunDistance += sunStep;
          sunStep *= 2.0;
        }

        // Beyond the marched ray, the optical depth from the shadow maps (BSM), filtered more
        // when the sun is near the horizon.
        if (h < shadowTopHeight) {
          let sunHeight = dot(sunDirection, normal);
          opticalDepth += cloudShadowOpticalDepth(
            p, sunDistance, 6.0 * saturate((sunHeight - 0.1) / -0.1), 1.0, jitter,
            viewMatrix, shadowMatrix0, shadowMatrix1, shadowMatrix2, shadowIntervalsA,
            shadowIntervalsB, shadowCascadeCount, cameraNear, shadowFar, shadowTexture,
            shadowSampler, shadowMapSize, sunDirection, earthCenter, earthRadius, shadowTopHeight, pixel
          );
        }

        // Sun and sky light at this height (getCloudsSunSkyIrradiance).
        let lightMix = saturate((h - bottom) / max(top - bottom, 1.0));
        let sunE = mix(sunE0, sunE1, lightMix);
        let skyE = mix(skyE0, skyE1, lightMix);
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

        // The clouds' front for the velocity (Frostbite 2016, 5.9.1).
        weightedDistanceSum += t * transmittance;
        transmittanceSum += transmittance;
      }

      if (transmittance <= minTransmittance) {
        break;
      }
      stepSize *= stepScale;
      t += stepSize;
    }
  }

  // Front distance: the clouds' front where they were hit, else the scene (or far away).
  var frontDistance = sceneDistance;
  if (transmittanceSum > 0.0) {
    frontDistance = near + weightedDistanceSum / transmittanceSum;
  }

  // Velocity for the temporal resolve: where the front point was on screen last frame.
  let frontPoint = origin + direction * frontDistance;
  let previousClip = previousViewProjection * vec4f(frontPoint, 1.0);
  let previousNdc = previousClip.xy / max(previousClip.w, 1e-6);
  let previousUv = vec2f(previousNdc.x * 0.5 + 0.5, 0.5 - previousNdc.y * 0.5);
  let velocity = select(vec2f(1e3), uv - previousUv, previousClip.w > 0.0);

  let alpha = saturate((transmittance - 1.0) / (minTransmittance - 1.0));

  // The haze ray (getHazeRayNearFar): to the ground, else out of the top of the haze; then no
  // further than the scene, and towards the clouds' front by their opacity.
  // Not in takram: the haze reaches up to hazeTopHeight (the top of the low layers) rather than
  // the top of all layers, which includes the high thin layer at 8,000 m. Flown above the low
  // clouds, takram's ceiling put hundreds of kilometres of haze in front of a level view and
  // drew a grey band above the horizon. Above the haze, the ray starts where it enters it.
  let hazeTop = raySphere(relative, direction, earthRadius + hazeTopHeight);
  var hazeNear = 0.0;
  var hazeFar = select(max(hazeTop.y, 0.0), ground.x, ground.x > 0.0);
  if (height >= hazeTopHeight) {
    hazeNear = max(hazeTop.x, 0.0);
    hazeFar = select(hazeNear, hazeFar, hazeTop.x > 0.0);
  }
  hazeFar = min(hazeFar, sceneDistance);
  if (transmittanceSum > 0.0) {
    hazeFar = mix(hazeFar, min(frontDistance, hazeFar), alpha);
  }
  hazeFar = max(hazeFar, hazeNear);

  // Light shafts: the length of the view ray in cloud shadow (marchShadowLength), from the
  // camera to the ground, the top of the shadow layers, the scene or the clouds' front.
  var shadowLength = vec2f(0.0);
  #ifdef SHADOW_LENGTH
  let shadowTop = raySphere(relative, direction, earthRadius + shadowTopHeight);
  var rayNear = cameraNear;
  var rayFar = select(shadowTop.y, ground.x, ground.x > 0.0);
  if (height >= shadowTopHeight) {
    rayNear = shadowTop.x;
  }
  rayFar = min(min(rayFar, sceneDistance), shadowLengthMarch.z);
  if (transmittanceSum > 0.0) {
    // Clamp at the clouds, by their opacity for smoother edges.
    rayFar = mix(rayFar, min(frontDistance, rayFar), alpha);
  }
  if (rayNear >= 0.0 && rayFar > rayNear) {
    let maxDistance = rayFar - rayNear;
    var shadowStep = shadowLengthMarch.x;
    var rayDistance = shadowStep * jitter;
    var lengthInShadow = 0.0;
    var weightedDistance = 0.0;
    for (var i = 0; i < i32(shadowLengthMarch.y); i++) {
      if (rayDistance > maxDistance) {
        break;
      }
      let q = origin + direction * (rayNear + rayDistance);
      let shadowDepth = cloudShadowOpticalDepth(
        q, 0.0, 0.0, 1.0, jitter,
        viewMatrix, shadowMatrix0, shadowMatrix1, shadowMatrix2, shadowIntervalsA,
        shadowIntervalsB, shadowCascadeCount, cameraNear, shadowFar, shadowTexture,
        shadowSampler, shadowMapSize, sunDirection, earthCenter, earthRadius, shadowTopHeight, pixel
      );
      let inShadow = (1.0 - exp(-shadowDepth)) * shadowStep;
      lengthInShadow += inShadow;
      weightedDistance += inShadow * (rayNear + rayDistance);
      shadowStep *= march.z;
      rayDistance += shadowStep;
    }
    // Not in takram: the atmosphere here takes the shadow as one stretch (length, start), so
    // the stretch is centred on where the shadowed samples lie on average.
    if (lengthInShadow > 0.0) {
      shadowLength = vec2f(
        lengthInShadow, max(weightedDistance / lengthInShadow - lengthInShadow * 0.5, 0.0)
      );
    }
  }
  #endif // SHADOW_LENGTH

  return mat4x4f(
    vec4f(radianceIntegral, alpha),
    vec4f(frontDistance, velocity, 0.0),
    vec4f(direction, hazeFar),
    vec4f(shadowLength, hazeNear, 0.0)
  );
}
