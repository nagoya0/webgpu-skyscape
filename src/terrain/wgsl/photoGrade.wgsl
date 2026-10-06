// Brings an aerial photograph closer to the ground's own colour. The photographs are taken from
// high up and carry the haze of the day as a lifted, low-contrast, desaturated image; the demo
// then adds its own aerial perspective on top, so without this the haze is applied twice.
//
//   color     the photograph's linear colour, as sampled
//   grade     (dehaze, contrast, saturation, unused):
//             dehaze 0 to < 1 removes that fraction of a flat haze: the colour's floor is
//             lowered and the rest stretched back to full range;
//             contrast scales around mid grey and saturation around the luminance, both in a
//             gamma 2.2 space so that dark areas are not crushed; 1 leaves them unchanged
fn photoGrade(color: vec3f, grade: vec4f) -> vec3f {
  var c = pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.2));
  let haze = grade.x;
  c = (c - haze) / max(1.0 - haze, 1e-3);
  c = (c - 0.5) * grade.y + 0.5;
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(luma), c, grade.z);
  return pow(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(2.2));
}
