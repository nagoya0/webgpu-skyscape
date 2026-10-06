// Optical depth of the clouds between a point and the sun, read from the cloud shadow maps.
// Port of getFadedCascadeIndex() (@takram/three-geospatial, src/shaders/cascadedShadowMaps.glsl),
// vogelDisk(), interleavedGradientNoise() and of getShadowUv(), getDistanceToShadowTop(),
// readShadowOpticalDepth(), sampleShadowOpticalDepthPCF() and sampleShadowOpticalDepth() from
// @takram/three-clouds 0.7.6 (src/shaders/clouds.frag), MIT, Copyright (c) 2024 Shota Matsuda.
// The cascades sit side by side in one texture.
//
//   position        world position
//   distanceOffset  distance towards the sun already accounted for (by a marched sun ray)
//   radius          filter radius in texels; below 0.1, one sample
//   tail            1 to add the optical depth tail (clouds), 0 to leave it out (the ground,
//                   as takram's aerial perspective, to avoid aliasing)
//   intervalsA/B    each cascade's (start, end) as fractions of `far`: (0, 1), then (2, 3)
//   pixel           screen pixel, for the filter's rotation
fn cloudShadowOpticalDepth(
  position: vec3f,
  distanceOffset: f32,
  radius: f32,
  tail: f32,
  jitter: f32,
  viewMatrix: mat4x4f,
  matrix0: mat4x4f,
  matrix1: mat4x4f,
  matrix2: mat4x4f,
  intervalsA: vec4f,
  intervalsB: vec4f,
  cascadeCount: i32,
  near: f32,
  far: f32,
  shadowTexture: texture_2d<f32>,
  shadowSampler: sampler,
  mapSize: f32,
  sunDirection: vec3f,
  earthCenter: vec3f,
  earthRadius: f32,
  topHeight: f32,
  pixel: vec2f
) -> f32 {
  // Distance to the top of the shadow layers along the sun direction, where the shadow map's
  // rays start.
  let distanceToTop = raySphere(position - earthCenter, sunDirection, earthRadius + topHeight).y;
  if (distanceToTop <= 0.0) {
    return 0.0;
  }

  // The cascade, faded into the next one by the jitter (getFadedCascadeIndex).
  let viewZ = (viewMatrix * vec4f(position, 1.0)).z;
  let depth = (viewZ + near) / (near - far);
  var nextIndex = -1;
  var prevIndex = -1;
  var alpha = 0.0;
  for (var i = 0; i < cascadeCount; i++) {
    var interval = select(intervalsB.xy, intervalsA.xy, i == 0);
    if (i == 1) { interval = intervalsA.zw; }
    if (i == 3) { interval = intervalsB.zw; }
    let center = (interval.x + interval.y) * 0.5;
    let closestEdge = select(interval.y, interval.x, depth < center);
    let margin = closestEdge * closestEdge * 0.5;
    interval += margin * vec2f(-0.5, 0.5);
    if (i < cascadeCount - 1) {
      if (depth >= interval.x && depth < interval.y) {
        prevIndex = nextIndex;
        nextIndex = i;
        alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);
      }
    } else if (depth >= interval.x) {
      // The last cascade does not fade out.
      prevIndex = nextIndex;
      nextIndex = i;
      alpha = saturate((depth - interval.x) / margin);
    }
  }
  let cascade = select(prevIndex, nextIndex, jitter <= alpha);
  if (cascade < 0) {
    return 0.0;
  }

  var matrix = matrix0;
  if (cascade == 1) { matrix = matrix1; }
  if (cascade == 2) { matrix = matrix2; }
  let clip = matrix * vec4f(position, 1.0);
  let ndc = clip.xy / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return 0.0;
  }

  // r: front distance, g: mean extinction, b: max optical depth, a: optical depth tail.
  let count = f32(cascadeCount);
  let half = 0.5 / mapSize;
  var sum = 0.0;
  var samples = 1;
  if (radius >= 0.1) {
    samples = 8;
  }
  // interleavedGradientNoise(), rotating the Vogel disk per pixel.
  let phi = fract(52.9829189 * fract(dot(pixel, vec2f(0.06711056, 0.00583715)))) * 6.28318530718;
  for (var i = 0; i < samples; i++) {
    var offset = vec2f(0.0);
    if (samples > 1) {
      // vogelDisk()
      let r = sqrt(f32(i) + 0.5) / sqrt(f32(samples));
      let theta = f32(i) * 2.39996322972865332 + phi;
      offset = r * vec2f(cos(theta), sin(theta)) * radius / mapSize;
    }
    // Stay inside this cascade's part of the texture.
    let local = clamp(uv + offset, vec2f(half), vec2f(1.0 - half));
    let s = textureSampleLevel(shadowTexture, shadowSampler, vec2f((f32(cascade) + local.x) / count, local.y), 0.0);
    let distanceToFront = max(0.0, distanceToTop - distanceOffset - s.r);
    sum += min(s.b + s.a * tail, s.g * distanceToFront);
  }
  return sum / f32(samples);
}
