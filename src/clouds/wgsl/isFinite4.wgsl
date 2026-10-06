// Whether all four components are finite (not NaN or infinite). WGSL lets compilers assume
// finite values, so `x != x` may be folded away; the exponent bits are checked instead.
fn isFinite4(v: vec4f) -> bool {
  let exponent = bitcast<vec4u>(v) & vec4u(0x7f800000u);
  return all(exponent != vec4u(0x7f800000u));
}
