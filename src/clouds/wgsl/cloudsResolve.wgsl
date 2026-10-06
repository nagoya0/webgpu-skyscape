// Temporal resolve of the cloud buffer into a full-resolution history. Port of
// @takram/three-clouds 0.7.6 (src/shaders/cloudsResolve.frag), MIT, Copyright (c) 2024 Shota
// Matsuda. SHADOW_LENGTH is not ported yet (docs/clouds-parity.md).
//
// With TEMPORAL_UPSCALE the cloud buffer has a quarter of the resolution in each direction, and
// each frame renders one pixel of every 4 × 4 block, in a Bayer order over 16 frames. The pixel
// rendered this frame is taken as it is; the others come from the history, reprojected with the
// clouds' velocity and clipped to the variance of the current neighbourhood. Without it, the
// cloud buffer is full resolution and blended into the history by temporalAlpha.
//
//   coord           full-resolution pixel
//   uv              its centre in UV, origin top left
//   ownedOffset     with TEMPORAL_UPSCALE, the pixel inside each 4 × 4 block rendered this frame
fn cloudsResolve(
  coord: vec2i,
  uv: vec2f,
  colorTexture: texture_2d<f32>,
  colorSampler: sampler,
  depthVelocityTexture: texture_2d<f32>,
  historyTexture: texture_2d<f32>,
  historySampler: sampler,
  ownedOffset: vec2i,
  varianceGamma: f32,
  temporalAlpha: f32
) -> vec4f {
  let size = vec2i(textureDimensions(colorTexture));
  let texel = 1.0 / vec2f(size);

  #ifdef TEMPORAL_UPSCALE
  let sourceCoord = coord / 4;
  // Where this pixel's centre falls in the cloud buffer, which covers 4 × its size in pixels.
  let sourceUv = (vec2f(coord) + 0.5) / vec2f(size * 4);
  #else // TEMPORAL_UPSCALE
  let sourceCoord = coord;
  let sourceUv = uv;
  #endif // TEMPORAL_UPSCALE

  // Not in takram: values that are not finite are dropped here, since one would otherwise stay
  // in the history and spread to its neighbours frame after frame.
  let loaded = textureLoad(colorTexture, sourceCoord, 0);
  let current = select(vec4f(0.0), loaded, isFinite4(loaded));

  #ifdef TEMPORAL_UPSCALE
  if (all(coord % 4 == ownedOffset)) {
    // Use the texel just rendered without any accumulation.
    return current;
  }
  #endif // TEMPORAL_UPSCALE

  // The velocity of the nearest front in the 3 × 3 neighbourhood (getClosestFragment).
  var closest = vec4f(1e7, 0.0, 0.0, 0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let neighbour = textureLoad(depthVelocityTexture, clamp(sourceCoord + vec2i(x, y), vec2i(0), size - 1), 0);
      if (neighbour.r < closest.r) {
        closest = neighbour;
      }
    }
  }
  let previousUv = uv - closest.gb;
  if (!isFinite4(closest) || any(previousUv < vec2f(0.0)) || any(previousUv > vec2f(1.0))) {
    return current; // Rejection
  }

  let history = textureSampleLevel(historyTexture, historySampler, previousUv, 0.0);
  if (!isFinite4(history)) {
    return current;
  }

  #ifdef TEMPORAL_UPSCALE
  // takram: variance clipping with a large gamma works for upsampling; it adds ghosting, which
  // is hard to notice on clouds.
  return varianceClipping(colorTexture, colorSampler, sourceUv, texel, current, history, varianceGamma);
  #else // TEMPORAL_UPSCALE
  let clipped = varianceClipping(colorTexture, colorSampler, sourceUv, texel, current, history, 1.0);
  return mix(clipped, current, temporalAlpha);
  #endif // TEMPORAL_UPSCALE
}
