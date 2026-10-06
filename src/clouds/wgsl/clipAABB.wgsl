// Clips the history colour towards the box (minColor, maxColor). Port of clipAABB() from
// @takram/three-clouds 0.7.6 (src/shaders/varianceClipping.glsl), MIT, Copyright (c) 2024 Shota
// Matsuda, after https://github.com/playdeadgames/temporal.
fn clipAABB(current: vec4f, history: vec4f, minColor: vec4f, maxColor: vec4f) -> vec4f {
  let pClip = 0.5 * (maxColor.rgb + minColor.rgb);
  let eClip = 0.5 * (maxColor.rgb - minColor.rgb) + 1e-7;
  let vClip = history - vec4f(pClip, current.a);
  let vUnit = vClip.xyz / eClip;
  let aUnit = abs(vUnit);
  let maUnit = max(aUnit.x, max(aUnit.y, aUnit.z));
  if (maUnit > 1.0) {
    return vec4f(pClip, current.a) + vClip / maUnit;
  }
  return history;
}
