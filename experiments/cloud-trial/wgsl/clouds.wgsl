// Trial: ray-marched cloud layer composited over the scene colour.
//   color      scene colour after aerial perspective (luminance, HDR)
//   viewZ      view-space z of the scene at this pixel (negative); very large for the sky
//   uv         screen UV, origin top left
//   sunE, skyE sun and sky illuminance at the cloud layer, from the atmosphere tables
//   frame      frame number, for the per-frame jitter that TAA averages out
fn clouds(
  color: vec4f,
  viewZ: f32,
  uv: vec2f,
  projectionInverse: mat4x4f,
  cameraWorld: mat4x4f,
  sunDirection: vec3f,
  sunE: vec3f,
  skyE: vec3f,
  base: f32,
  top: f32,
  time: f32,
  frame: f32
) -> vec4f {
  // Ray in view space, then world space.
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.5, 1.0);
  let viewPoint = projectionInverse * ndc;
  let directionView = normalize(viewPoint.xyz / viewPoint.w);
  let origin = cameraWorld[3].xyz;
  let direction = normalize((cameraWorld * vec4f(directionView, 0.0)).xyz);

  // Distance to the scene along the ray.
  let sceneDistance = -viewZ / max(-directionView.z, 1e-4);

  // Intersect the slab base <= y <= top.
  var tEnter = 0.0;
  var tExit = 0.0;
  if (abs(direction.y) < 1e-5) {
    if (origin.y < base || origin.y > top) {
      return color;
    }
    tExit = 1e9;
  } else {
    let t0 = (base - origin.y) / direction.y;
    let t1 = (top - origin.y) / direction.y;
    tEnter = max(min(t0, t1), 0.0);
    tExit = max(t0, t1);
  }
  tExit = min(min(tExit, sceneDistance), 40000.0);
  if (tExit <= tEnter) {
    return color;
  }

  let steps = 96;
  let stepLength = (tExit - tEnter) / f32(steps);
  // Per-pixel, per-frame jitter of the start, so TAA turns banding into smooth gradients.
  let jitter = fract(sin(dot(uv * 1000.0 + vec2f(frame * 0.61803, frame * 0.41421), vec2f(12.9898, 78.233))) * 43758.5453);

  let cosTheta = dot(direction, sunDirection);
  // Two lobes: strong forward scattering for the silver lining, some back scattering.
  let phase = mix(phaseHG(cosTheta, 0.8), phaseHG(cosTheta, -0.3), 0.3);

  var transmittance = 1.0;
  var luminance = vec3f(0.0);
  var t = tEnter + stepLength * jitter;
  for (var i = 0; i < steps; i++) {
    if (t > tExit || transmittance < 0.01) {
      break;
    }
    let p = origin + direction * t;
    let sigma = cloudDensity(p, base, top, time, 4);
    if (sigma > 0.0) {
      // Optical depth towards the sun, in a few growing steps.
      var lightDepth = 0.0;
      var lightStep = 40.0;
      var q = p;
      for (var j = 0; j < 5; j++) {
        q += sunDirection * lightStep;
        lightDepth += cloudDensity(q, base, top, time, 2) * lightStep;
        lightStep *= 1.8;
      }
      let lightTransmittance = exp(-lightDepth);
      // Powder effect: darker edges facing the sun.
      let powder = 1.0 - exp(-2.0 * lightDepth);
      let inScatter = sunE * phase * lightTransmittance * mix(1.0, powder, 0.5) + skyE * 0.08;
      // Integrate over the step exactly for constant sigma.
      let stepTransmittance = exp(-sigma * stepLength);
      luminance += transmittance * inScatter * (1.0 - stepTransmittance);
      transmittance *= stepTransmittance;
    }
    t += stepLength;
  }
  return vec4f(color.rgb * transmittance + luminance, color.a);
}
