// Gray-Scott reaction-diffusion with spatially varying feed/kill rates.
// State texels: r = substrate (U), g = organism (V), b = pigment, a = age.
// Texel (x, y) covers CSS pixels ((x, y) + 0.5) * uCell, with y pointing down.

uniform sampler2D uState;
uniform sampler2D uField;     // r = letterform, g = letter moat, b = morphology
uniform sampler2D uInfluence; // r = inhibition, g = inoculation, b = nutrient
uniform ivec2 uGrid;
uniform float uStrain;
uniform float uSpores;
uniform float uNameRate;

out vec4 outState;

vec4 cell(ivec2 c) {
  return texelFetch(uState, clamp(c, ivec2(0), uGrid - 1), 0);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = cell(c);
  vec4 n = cell(c + ivec2(0, -1));
  vec4 so = cell(c + ivec2(0, 1));
  vec4 e = cell(c + ivec2(1, 0));
  vec4 w = cell(c + ivec2(-1, 0));
  vec2 diagonal = cell(c + ivec2(1, 1)).xy + cell(c + ivec2(-1, 1)).xy +
                  cell(c + ivec2(1, -1)).xy + cell(c + ivec2(-1, -1)).xy;
  vec2 lap = (n.xy + so.xy + e.xy + w.xy) * 0.2 + diagonal * 0.05 - s.xy;

  vec4 field = texelFetch(uField, c, 0);
  vec4 influence = texelFetch(uInfluence, c, 0);
  float inhibit = influence.r;
  float stroke = influence.g;

  // Morphology drifts from dividing spots (low) to coral mazes (high), and
  // the hovering pointer enriches the medium under it.
  float F = mix(0.0300, 0.0545, field.b) + influence.b * 0.012;
  float k = mix(0.0630, 0.0620, field.b);
  // Inside the letterforms the organism settles into a solid, uniform mat.
  F = mix(F, 0.0600, field.r);
  k = mix(k, 0.0400, field.r);

  float U = s.x;
  float V = s.y;

  // New growth inherits pigment from the neighbours it grew out of.
  float weight = n.y + so.y + e.y + w.y + 1e-5;
  float inherited = (n.y * n.z + so.y * so.z + e.y * e.z + w.y * w.z) / weight;
  float pigment = mix(inherited, s.z, smoothstep(0.04, 0.2, V));

  // Inoculation is held along the recent stroke long enough for it to take.
  if (stroke > 0.0) {
    V = max(V, 0.3 * stroke);
    U = min(U, 1.0 - 0.5 * stroke);
    pigment = mix(pigment, uStrain, stroke);
    inhibit *= 1.0 - stroke;
  }

  // Dormant spores scattered through the letterforms re-seed the name
  // wherever it failed to take or a window has cleared it. They sit in 4×4
  // clusters: a single cell is too small a nucleus to survive diffusion.
  vec2 cluster = floor(vec2(c) / 4.0);
  float spore = fract(sin(dot(cluster, vec2(12.9898, 78.233))) * 43758.5453);
  if (field.r > 0.5 && inhibit < 0.05 && V < 0.05 && spore > 1.0 - 0.04 * uSpores) {
    V = 0.3;
    U = 0.5;
  }

  // The name's organism has a slower metabolism, so it visibly grows in.
  float rate = mix(1.0, uNameRate, field.r);
  float reaction = U * V * V;
  float kill = k + inhibit * 0.05;
  U += rate * (lap.x - reaction + F * (1.0 - U));
  V += rate * (0.5 * lap.y + reaction - (F + kill) * V);
  V *= 1.0 - 0.06 * inhibit;

  float age = s.w + (V > 0.18 ? 0.0004 : -0.004);
  outState = vec4(clamp(U, 0.0, 1.0), clamp(V, 0.0, 1.0), pigment, clamp(age, 0.0, 1.0));
}
