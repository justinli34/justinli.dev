// Renders the culture under two illuminations and blends between them.
// Bright-field: pigmented colonies on a backlit agar. Dark-field: the same
// colonies scattering light against a black stage. The navigation discs are
// glass lenses resting on the plate, drawn here so they refract the culture.

uniform sampler2D uState;
uniform sampler2D uField;
uniform ivec2 uGrid;
uniform float uCell;
uniform vec2 uView;
uniform vec2 uCanvas;
uniform float uDark;
uniform float uReveal;
uniform vec3 uFeeder; // x, y, radius of the hovering pointer (0: none)
// medium, medium edge, plate strain A, plate strain B, visitor strain, name ink
uniform vec3 uBright[6];
uniform vec3 uDarkfield[6];
uniform int uLensCount;
uniform vec4 uLenses[MAX_LENSES]; // center.xy, radius, hover (0..1)
uniform float uLensInk[MAX_LENSES]; // stained while its window is open (0..1)

out vec4 outColor;

vec4 fetchState(ivec2 c) {
  return texelFetch(uState, clamp(c, ivec2(0), uGrid - 1), 0);
}

vec4 sampleState(vec2 g) {
  vec2 q = g - 0.5;
  vec2 f = floor(q);
  vec2 t = q - f;
  ivec2 i = ivec2(f);
  vec4 a = fetchState(i);
  vec4 b = fetchState(i + ivec2(1, 0));
  vec4 c = fetchState(i + ivec2(0, 1));
  vec4 d = fetchState(i + ivec2(1, 1));
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

float sampleLetter(vec2 g) {
  vec2 q = g - 0.5;
  vec2 f = floor(q);
  vec2 t = q - f;
  ivec2 i = ivec2(f);
  ivec2 hi = uGrid - 1;
  float a = texelFetch(uField, clamp(i, ivec2(0), hi), 0).r;
  float b = texelFetch(uField, clamp(i + ivec2(1, 0), ivec2(0), hi), 0).r;
  float c = texelFetch(uField, clamp(i + ivec2(0, 1), ivec2(0), hi), 0).r;
  float d = texelFetch(uField, clamp(i + ivec2(1, 1), ivec2(0), hi), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 pigmentColor(float p, vec3 a, vec3 b, vec3 strain) {
  vec3 plate = mix(a, b, smoothstep(0.1, 0.45, p));
  return mix(plate, strain, smoothstep(0.6, 0.95, p));
}

/** The plate as seen from above at a CSS position, with nothing on it. */
vec3 plate(vec2 css) {
  vec2 g = css / uCell;
  vec4 st = sampleState(g);
  float vx = sampleState(g + vec2(0.75, 0.0)).y - sampleState(g - vec2(0.75, 0.0)).y;
  float vy = sampleState(g + vec2(0.0, 0.75)).y - sampleState(g - vec2(0.0, 0.75)).y;

  float u = st.x;
  float v = st.y;
  float body = smoothstep(0.135, 0.175, v);
  float rim = 1.0 - smoothstep(0.0, 0.03, abs(v - 0.13));
  float stain = smoothstep(0.03, 0.55, 1.0 - u);
  float letter = sampleLetter(g);

  // Colonies are domed: light them from the upper left like a wet surface.
  vec3 normal = normalize(vec3(-vx * 5.0, -vy * 5.0, 1.0));
  vec3 light = normalize(vec3(-0.45, -0.55, 0.7));
  float diffuse = dot(normal, light);
  float spec = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);

  float vignette = smoothstep(0.25, 1.15, length((css - uView * 0.5) / max(uView.x, uView.y)) * 2.0);
  float grain = hash(floor(gl_FragCoord.xy)) - 0.5;
  // The medium brightens a little where the hovering pointer is feeding it.
  float lamp = uFeeder.z > 0.0
    ? 1.0 - smoothstep(0.0, uFeeder.z * 1.6, length(css - uFeeder.xy))
    : 0.0;

  // Bright-field
  vec3 bMedium = mix(uBright[0], uBright[1], vignette) + grain * 0.014;
  bMedium = mix(bMedium, vec3(1.0, 0.99, 0.96), lamp * 0.45);
  vec3 bPigment = mix(pigmentColor(st.z, uBright[2], uBright[3], uBright[4]), uBright[5], letter);
  vec3 bright = mix(bMedium, mix(bMedium, bPigment, 0.035), stain);
  float relief = mix(0.06, 0.18, letter);
  vec3 bBody = bPigment * (1.0 + relief * (diffuse - 0.6));
  bBody = mix(bBody, bPigment * 0.86, smoothstep(0.24, 0.42, v) + st.w * 0.25);
  bright = mix(bright, bBody, body);
  bright = mix(bright, bPigment * 0.8, rim * (1.0 - letter) * 0.4);
  bright += spec * body * mix(0.04, 0.16, letter);

  // Dark-field
  vec3 dMedium = mix(uDarkfield[0], uDarkfield[1], vignette) + grain * 0.02;
  dMedium += uDarkfield[2] * lamp * 0.06;
  vec3 dPigment = mix(pigmentColor(st.z, uDarkfield[2], uDarkfield[3], uDarkfield[4]), uDarkfield[5], letter);
  // Dark-field lights edges, not bodies: colonies read as glowing outlines.
  float halo = 1.0 - smoothstep(0.0, 0.06, abs(v - 0.13));
  float scatter = stain * 0.04 + mix(body * 0.1 + halo * 0.8, body * 0.92, letter);
  vec3 dark = dMedium + dPigment * scatter;
  dark += dPigment * spec * body * 0.25 * (1.0 - letter);

  vec3 color = mix(bright, dark, uDark);
  vec3 medium = mix(bMedium, dMedium, uDark);
  return mix(medium, color, uReveal);
}

/**
 * A glass bead resting on the plate. It magnifies the culture under its
 * centre and bends the surroundings in toward its rim, with a little
 * chromatic fringe, a milky body so its label stays legible, and a specular
 * highlight from the same light that shades the colonies.
 */
vec3 lens(vec2 center, vec2 d, float q, float radius, float hover, float ink, vec3 behind) {
  float h = sqrt(max(0.0, 1.0 - q * q));
  vec3 n = normalize(vec3(d / radius, h));

  float magnify = mix(0.55, 0.38, hover);
  vec2 bend = d * (magnify + (1.0 - h) * 1.15);
  vec3 seen = vec3(
    plate(center + bend * 1.05).r,
    plate(center + bend).g,
    plate(center + bend * 0.95).b
  );

  vec3 inkColor = mix(uBright[5], uDarkfield[5], uDark);
  vec3 body = mix(vec3(0.99, 0.98, 0.955), vec3(0.075, 0.07, 0.1), uDark);
  vec3 edge = mix(uBright[5], uDarkfield[2], uDark);

  // Milky in the middle where the label sits, clearer toward the rim.
  seen = mix(seen, body, mix(0.62, 0.18, q * q));
  seen = mix(seen, inkColor, ink * 0.88);

  float fresnel = pow(1.0 - h, 3.0);
  seen = mix(seen, edge, fresnel * mix(0.5, 0.0, uDark));
  seen += edge * fresnel * 0.85 * uDark;

  vec3 light = normalize(vec3(-0.5, -0.65, 0.58));
  float facing = max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0);
  seen += vec3(1.0) * (pow(facing, 90.0) * 0.9 + pow(facing, 10.0) * 0.07);
  // Light leaving through the far side of the bead.
  float exit = smoothstep(0.68, 0.97, q) * max(0.0, dot(d / max(length(d), 1e-3), normalize(vec2(0.55, 0.85))));
  seen += mix(vec3(1.0), uDarkfield[2], uDark) * exit * mix(0.32, 0.22, uDark);

  float aa = 1.25 / radius;
  seen = mix(seen, edge, smoothstep(1.0 - 3.0 * aa, 1.0 - aa, q) * 0.4);
  float inside = (1.0 - smoothstep(1.0 - aa, 1.0, q)) * uReveal;
  return mix(behind, seen, inside);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) * (uView / uCanvas);
  vec3 color = plate(css);

  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec4 bead = uLenses[i];
    float radius = bead.z * (1.0 + 0.04 * bead.w);
    vec2 d = css - bead.xy;
    float q = length(d) / radius;
    if (q > 1.4) continue;

    // Soft contact shadow, cast away from the light.
    float s = length(d - vec2(0.05, 0.1) * radius) / radius;
    float shadow = (1.0 - smoothstep(0.9, 1.32, s)) * smoothstep(0.97, 1.02, q);
    color *= 1.0 - shadow * mix(0.16, 0.4, uDark) * uReveal;
    if (q < 1.0) color = lens(bead.xy, d, q, radius, bead.w, uLensInk[i], color);
  }

  outColor = vec4(color, 1.0);
}
