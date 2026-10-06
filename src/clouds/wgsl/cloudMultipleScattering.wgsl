// Port of henyeyGreenstein(), phaseFunction() and approximateMultipleScattering() from
// @takram/three-clouds 0.7.6 (src/shaders/clouds.frag), MIT, Copyright (c) 2024 Shota Matsuda.
// Multiple scattering after Wrenninge et al., "Oz: The Great and Volumetric": each octave
// attenuates the scattering, the extinction and the phase anisotropy by half.
//   phase  (g1, g2, mix of the second lobe)
fn cloudMultipleScattering(opticalDepth: f32, cosTheta: f32, phase: vec3f) -> f32 {
  var a = 1.0; // attenuation
  var b = 1.0; // contribution to extinction
  var c = 1.0; // phase attenuation
  var scattering = 0.0;
  for (var i = 0; i < 8; i++) {
    let g = phase.xy * c;
    let g2 = g * g;
    let hg = 0.07957747 * (1.0 - g2) / max(vec2f(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2f(1.5)));
    let p = dot(hg, vec2f(1.0 - phase.z, phase.z));
    scattering += a * exp(-opticalDepth * b) * p;
    a *= 0.5;
    b *= 0.5;
    c *= 0.5;
  }
  return scattering;
}
