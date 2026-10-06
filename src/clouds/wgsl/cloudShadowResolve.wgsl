// Temporal resolve of the cloud shadow maps. Port of @takram/three-clouds 0.7.6
// (src/shaders/shadowResolve.frag, with varianceClipping() for nine samples from
// src/shaders/varianceClipping.glsl), MIT, Copyright (c) 2024 Shota Matsuda.
// Changes: the cascades sit side by side in one texture, so neighbours are clamped to the
// texel's own cascade; values that are not finite are dropped, as in cloudsResolve.wgsl.
//
//   coord     texel in the shadow texture
//   mapSize   texels per cascade side
fn cloudShadowResolve(
  coord: vec2i,
  currentTexture: texture_2d<f32>,
  depthVelocityTexture: texture_2d<f32>,
  historyTexture: texture_2d<f32>,
  historySampler: sampler,
  mapSize: i32,
  cascadeCount: i32,
  varianceGamma: f32,
  temporalAlpha: f32
) -> vec4f {
  let cascade = coord.x / mapSize;
  let origin = vec2i(cascade * mapSize, 0);
  let local = coord - origin;
  let loaded = textureLoad(currentTexture, coord, 0);
  let current = select(vec4f(0.0), loaded, isFinite4(loaded));

  // The nearest front in the 3 × 3 neighbourhood, and the moments for variance clipping.
  var closest = vec4f(1e7, 0.0, 0.0, 0.0);
  var moment1 = vec4f(0.0);
  var moment2 = vec4f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let neighbourCoord = origin + clamp(local + vec2i(x, y), vec2i(0), vec2i(mapSize - 1));
      let depthVelocity = textureLoad(depthVelocityTexture, neighbourCoord, 0);
      if (depthVelocity.r < closest.r) {
        closest = depthVelocity;
      }
      let neighbour = textureLoad(currentTexture, neighbourCoord, 0);
      moment1 += neighbour;
      moment2 += neighbour * neighbour;
    }
  }

  let size = f32(mapSize);
  let previousUv = (vec2f(local) + 0.5 - closest.gb) / size;
  if (!isFinite4(closest) || any(previousUv < vec2f(0.0)) || any(previousUv > vec2f(1.0))) {
    return current; // Rejection
  }
  let half = 0.5 / size;
  let inCascade = clamp(previousUv, vec2f(half), vec2f(1.0 - half));
  let history = textureSampleLevel(
    historyTexture, historySampler, vec2f((f32(cascade) + inCascade.x) / f32(cascadeCount), inCascade.y), 0.0
  );
  if (!isFinite4(history) || !isFinite4(moment2)) {
    return current;
  }

  let mean = moment1 / 9.0;
  let deviation = sqrt(max(moment2 / 9.0 - mean * mean, vec4f(0.0))) * varianceGamma;
  let minColor = mean - deviation;
  let maxColor = mean + deviation;
  let clipped = clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
  return mix(clipped, current, temporalAlpha);
}
