// Everything outside the culture that acts on it, rasterised once per frame:
// r = inhibition (zones around the interface and the moat around the name),
// g = inoculation along the visitor's recent stroke, b = nutrient under the
// hovering pointer. The simulation reads this instead of re-deriving it for
// every step.

uniform sampler2D uField; // r = letterform, g = letter moat
uniform float uCell;
uniform int uZoneCount;
uniform vec4 uZones[MAX_ZONES];      // center.xy, half size.xy (CSS px)
uniform vec4 uZoneShapes[MAX_ZONES]; // corner radius, margin, feather, strength
uniform vec3 uFeeder;                // x, y, radius (0 when not feeding)
uniform int uStrokeCount;
uniform vec4 uStrokes[MAX_STROKES];  // segments: x0, y0, x1, y1
uniform float uStrokeRadius;

out vec4 outInfluence;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 p = (vec2(c) + 0.5) * uCell;
  vec4 field = texelFetch(uField, c, 0);

  // The moat only has to keep the plate's colonies off the name; at full
  // strength it starves small pieces of the name itself, like an i's dot.
  float inhibit = field.g * (1.0 - field.r) * 0.7;
  for (int i = 0; i < MAX_ZONES; i++) {
    if (i >= uZoneCount) break;
    vec4 zone = uZones[i];
    vec4 shape = uZoneShapes[i];
    float d = sdRoundBox(p - zone.xy, zone.zw, shape.x) - shape.y;
    inhibit = max(inhibit, (1.0 - smoothstep(0.0, shape.z, d)) * shape.w);
  }

  float stroke = 0.0;
  for (int i = 0; i < MAX_STROKES; i++) {
    if (i >= uStrokeCount) break;
    float d = sdSegment(p, uStrokes[i].xy, uStrokes[i].zw);
    stroke = max(stroke, 1.0 - smoothstep(uStrokeRadius * 0.4, uStrokeRadius, d));
  }

  float feed = 0.0;
  if (uFeeder.z > 0.0) {
    feed = 1.0 - smoothstep(uFeeder.z * 0.35, uFeeder.z, length(p - uFeeder.xy));
  }

  outInfluence = vec4(inhibit, stroke, feed, 1.0);
}
