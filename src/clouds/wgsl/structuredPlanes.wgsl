// The first sample distance and the step size along a ray that put every sample on a set of
// parallel planes, so samples stay in place as the ray origin moves. Port of
// intersectStructuredPlanes() from @takram/three-clouds 0.7.6
// (src/shaders/structuredSampling.glsl), MIT, Copyright (c) 2024 Shota Matsuda, after
// https://github.com/huwb/volsample/blob/master/src/unity/Assets/Shaders/RayMarchCore.cginc
// Returns (first sample distance, step size).
fn structuredPlanes(normal: vec3f, rayOrigin: vec3f, rayDirection: vec3f, samplePeriod: f32) -> vec2f {
  let NoD = dot(rayDirection, normal);
  let stepSize = samplePeriod / abs(NoD);
  // Skip the leftover bit from the origin to the first plane. GLSL's mod() follows the sign of
  // the divisor; written out here the same way.
  let d = dot(rayOrigin, normal);
  var stepOffset = -(d - samplePeriod * floor(d / samplePeriod)) / NoD;
  // Make sure the first sample is in front of the origin.
  if (stepOffset < 0.0) {
    stepOffset += stepSize;
  }
  return vec2f(stepOffset, stepSize);
}
