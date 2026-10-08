// Colour grading after tone mapping (ADR 0031: the whole image is graded at the end), screen
// based: the same for every pixel. Works on gamma-encoded values (2.2), closer to how the eye
// judges contrast and colour. With the neutral settings the colour comes back as it went in.
//
//   whiteBalance     gains per channel, from the colour temperature and tint
//   contrast         around mid grey; 1 unchanged
//   saturation       1 unchanged
//   vibrance         saturation that acts more on dull colours; 0 unchanged
//   blueHue          shift of blue hues, in turns of the colour wheel; 0 unchanged
//   blueSaturation   saturation of blue hues; 1 unchanged
//   shadowTint       colour added to the shadows; 0 unchanged
//   highlightTint    colour added to the highlights; 0 unchanged
fn colorGrade(
  color: vec3f,
  whiteBalance: vec3f,
  contrast: f32,
  saturation: f32,
  vibrance: f32,
  blueHue: f32,
  blueSaturation: f32,
  shadowTint: vec3f,
  highlightTint: vec3f
) -> vec3f {
  var c = pow(max(color * whiteBalance, vec3f(0.0)), vec3f(1.0 / 2.2));
  c = (c - 0.5) * contrast + 0.5;

  let weights = vec3f(0.2126, 0.7152, 0.0722);
  var luma = dot(c, weights);
  let chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  c = mix(vec3f(luma), c, saturation * (1.0 + vibrance * (1.0 - chroma)));

  // Blue hues: to HSV, shift and saturate those near blue, and back.
  let maxC = max(max(c.r, c.g), c.b);
  let minC = min(min(c.r, c.g), c.b);
  let delta = maxC - minC;
  if (delta > 1e-5 && maxC > 0.0) {
    var hue: f32;
    if (maxC == c.r) {
      hue = ((c.g - c.b) / delta) / 6.0;
    } else if (maxC == c.g) {
      hue = ((c.b - c.r) / delta + 2.0) / 6.0;
    } else {
      hue = ((c.r - c.g) / delta + 4.0) / 6.0;
    }
    hue = fract(hue);
    // Blue is about 0.6 of a turn; the weight fades over a sixth of a turn either side.
    let blue = 1.0 - smoothstep(0.0, 1.0 / 6.0, abs(hue - 0.6));
    let s = clamp(delta / maxC * mix(1.0, blueSaturation, blue), 0.0, 1.0);
    let h = fract(hue + blueHue * blue);
    let k = fract(vec3f(h) + vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0;
    c = maxC * mix(vec3f(1.0), clamp(abs(k) - 1.0, vec3f(0.0), vec3f(1.0)), s);
  }

  luma = dot(c, weights);
  c += shadowTint * (1.0 - smoothstep(0.0, 0.5, luma)) + highlightTint * smoothstep(0.5, 1.0, luma);
  return pow(max(c, vec3f(0.0)), vec3f(2.2));
}
