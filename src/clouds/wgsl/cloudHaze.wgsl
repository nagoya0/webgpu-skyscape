// Haze below and between the clouds, applied over the cloud colour. Port of approximateHaze()
// and its use in main() from @takram/three-clouds 0.7.6 (src/shaders/clouds.frag), MIT,
// Copyright (c) 2024 Shota Matsuda. The optical depth is analytical for a density falling
// exponentially with height, after https://iquilezles.org/articles/fog/
//
//   color           cloud colour (premultiplied) and opacity, after the aerial perspective
//   direction       view ray in world space
//   hazeDistance    length of the haze ray: to the ground, the top of the cloud layers, the
//                   scene or the clouds' front, whichever comes first
//   relativeCamera  camera position relative to the earth's centre
//   groundSunE, groundSkyE  sun and sky illuminance at the camera
//   phase           (g1, g2, second lobe mix, unused), as for the clouds
//   haze            (density scale, exponent per metre, scattering, absorption)
//   shadowLength    length of the ray in cloud shadow; 0 until SHADOW_LENGTH is ported
fn cloudHaze(
  color: vec4f,
  direction: vec3f,
  hazeDistance: f32,
  relativeCamera: vec3f,
  earthRadius: f32,
  near: f32,
  sunDirection: vec3f,
  groundSunE: vec3f,
  groundSkyE: vec3f,
  coverage: f32,
  phase: vec4f,
  skyLightScale: f32,
  haze: vec4f,
  shadowLength: f32
) -> vec4f {
  #ifdef HAZE
  let cameraHeight = length(relativeCamera) - earthRadius;
  let modulation = saturate((coverage - 0.2) / 0.2);
  if (cameraHeight * modulation < 0.0) {
    return color;
  }
  let density = modulation * haze.x * exp(-cameraHeight * haze.y);
  if (density < 1e-7) {
    return color; // Prevent artefacts in views from space
  }

  // Blend two normals by the difference in angle, so that the normal near the ground is that of
  // the origin, and in the sky that of the horizon.
  let rayOrigin = relativeCamera + direction * near;
  let normalAtOrigin = normalize(rayOrigin);
  let normalAtHorizon = (rayOrigin - dot(rayOrigin, direction) * direction) / earthRadius;
  let alpha = saturate((dot(normalAtOrigin, normalAtHorizon) - 0.9) / 0.1);
  let normal = mix(normalAtOrigin, normalAtHorizon, alpha);

  let angle = max(dot(normal, direction), 1e-5);
  let exponent = angle * haze.y;
  let linearTerm = density / haze.y / angle;

  // The optical depths with and without the shadow length.
  let expTerm = 1.0 - exp(-hazeDistance * exponent);
  let shadowExpTerm = 1.0 - exp(-min(hazeDistance, shadowLength) * exponent);
  let opticalDepth = expTerm * linearTerm;
  let shadowOpticalDepth = max((expTerm - shadowExpTerm) * linearTerm, 0.0);
  let transmittance = saturate(1.0 - exp(-opticalDepth));
  let shadowTransmittance = saturate(1.0 - exp(-shadowOpticalDepth));

  // takram's phaseFunction(): two Henyey-Greenstein lobes.
  let cosTheta = dot(direction, sunDirection);
  let g = phase.xy;
  let g2 = g * g;
  let hg = 0.07957747 * (1.0 - g2) / max(vec2f(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2f(1.5)));
  let phaseValue = dot(hg, vec2f(1.0 - phase.z, phase.z));

  var inscatter = groundSunE * phaseValue * shadowTransmittance;
  inscatter += groundSkyE * 0.07957747 * skyLightScale * transmittance;
  inscatter *= haze.z / (haze.w + haze.z);

  return vec4f(mix(color.rgb, inscatter, transmittance), color.a * (1.0 - transmittance) + transmittance);
  #else // HAZE
  return color;
  #endif // HAZE
}
