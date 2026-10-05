// Procedural facade for untextured PLATEAU buildings (ADR 0023; ideas.md, PLATEAU textures,
// option A). Returns the albedo in rgb and a window mask in a (1 on a window pane, 0 on the wall).
//   position  world position (x north, y up, z east)
//   normal    world normal
fn facade(position: vec3f, normal: vec3f) -> vec4f {
  // Per-building variation, approximated by a coarse cell of the ground plan.
  let cell = floor(position.xz / 24.0);
  let h = fract(sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453);
  let h2 = fract(sin(dot(cell, vec2f(269.5, 183.3))) * 43758.5453);

  // Coordinates on the wall: along it horizontally, and up. Floors of 3.6 m; window bays of
  // 1.8 to 3.6 m depending on the building.
  let along = normalize(vec2f(-normal.z, normal.x) + vec2f(1e-6, 0.0));
  let bay = mix(1.8, 3.6, h2);
  let su = dot(position.xz, along) / bay;
  let sv = position.y / 3.6;

  // Screen-space derivatives must be taken in uniform control flow, before any branch.
  let wu = fwidth(su) * 1.5;
  let wv = fwidth(sv) * 1.5;

  // Concrete greys and warm beiges.
  let wall = mix(vec3f(0.42, 0.42, 0.43), vec3f(0.55, 0.50, 0.44), h) * mix(0.8, 1.15, h2);

  // Window pane inside each bay: ribbon windows on some buildings, punched ones on others.
  // Soft edges, as wide as a pixel or more, keep distant facades from shimmering.
  let paneWidth = select(0.55, 0.92, h > 0.6);
  let du = abs(fract(su) - 0.5) * 2.0;
  let fv = fract(sv);
  let edgeU = smoothstep(paneWidth + wu, paneWidth - wu, du);
  let edgeV = smoothstep(0.3 - wv, 0.3 + wv, fv) * smoothstep(0.85 + wv, 0.85 - wv, fv);
  // Fade the pattern out where a bay is smaller than a few pixels; average it instead.
  let detail = 1.0 - smoothstep(0.25, 0.6, max(wu, wv));
  let pane = mix(paneWidth * 0.55, edgeU * edgeV, detail);

  // Roofs and other near-horizontal faces have no windows and are a little darker.
  let isWall = abs(normal.y) < 0.5;
  let glass = vec3f(0.10, 0.13, 0.16) * mix(0.8, 1.3, h);
  let paneOnWall = select(0.0, pane, isWall);
  let base = select(wall * 0.75, wall, isWall);
  return vec4f(mix(base, glass, paneOnWall), paneOnWall);
}
