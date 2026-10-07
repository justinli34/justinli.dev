#version 300 es
precision highp float;

uniform vec2 uResolution;

out vec4 outColor;

const float FAR = 90.0;
// Upper bound on terrain elevation, used to stop marching rays headed for sky.
const float PEAK_HEIGHT = 7.6;
const vec3 MOON_DIR = normalize(vec3(-0.8, 0.45, -0.35));
// Rotates each octave so grid artifacts don't line up, and doubles frequency.
const mat2 OCTAVE = mat2(1.6, 1.2, -1.2, 1.6);

float hash(vec2 cell) {
  uvec2 q = uvec2(ivec2(cell)) * uvec2(0x9E3779B9u, 0x85EBCA6Bu);
  uint n = q.x ^ q.y;
  n ^= n >> 16u;
  n *= 0x7FEB352Du;
  n ^= n >> 15u;
  n *= 0x846CA68Bu;
  n ^= n >> 16u;
  return float(n) / 4294967295.0;
}

// Value noise in [-1, 1] with its analytic gradient in yz.
vec3 noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  float k = a - b - c + d;

  float value = a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y;
  vec2 gradient = du * vec2(b - a + k * u.y, c - a + k * u.x);
  return vec3(value * 2.0 - 1.0, gradient * 2.0);
}

// Ridged fractal noise. Folding each octave around zero turns its zero
// crossings into sharp crests, and steep areas suppress finer octaves. The
// gradient flips sign across each crest, so the damping jumps there too,
// which breaks faces up into fractured, blocky rock.
float terrain(vec2 p, int octaves) {
  float height = 0.0;
  float amplitude = 0.5;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < octaves; i++) {
    vec3 n = noise(p);
    n = vec3(1.0 - abs(n.x), -sign(n.x) * n.yz);
    slope += n.yz;
    height += amplitude * n.x / (1.0 + 0.5 * dot(slope, slope));
    amplitude *= 0.48;
    p = OCTAVE * p;
  }
  return height;
}

float elevation(vec2 p, int octaves) {
  // A barren plain near the camera with peaks rising further back. Clamping
  // the top leaves some of the tallest ones as flat mesas.
  float amplitude = mix(0.6, 8.0, smoothstep(2.0, 40.0, p.y));
  float h = clamp((terrain(p * 0.07, octaves) - 0.15) / 0.55, 0.0, 1.0);
  return amplitude * h * h - 0.4;
}

vec3 terrainNormal(vec3 p, float t) {
  vec2 e = vec2(0.0015 * t, 0.0);
  return normalize(vec3(
    elevation(p.xz - e.xy, 9) - elevation(p.xz + e.xy, 9),
    2.0 * e.x,
    elevation(p.xz - e.yx, 9) - elevation(p.xz + e.yx, 9)
  ));
}

float march(vec3 origin, vec3 dir) {
  float t = 0.05;
  for (int i = 0; i < 160; i++) {
    vec3 p = origin + dir * t;
    if (t > FAR || (p.y > PEAK_HEIGHT && dir.y >= 0.0)) return FAR;
    float d = p.y - elevation(p.xz, 6);
    if (d < 0.002 * t) return t;
    t += 0.35 * d;
  }
  // Out of steps means a grazing ray skimming the surface; call it a hit.
  return t;
}

float shadow(vec3 origin) {
  float lit = 1.0;
  float t = 0.2;
  for (int i = 0; i < 32; i++) {
    vec3 p = origin + MOON_DIR * t;
    if (p.y > PEAK_HEIGHT) break;
    float d = p.y - elevation(p.xz, 5);
    lit = min(lit, 12.0 * d / t);
    if (lit < 0.001) break;
    t += clamp(d, 0.05, 1.0);
  }
  return smoothstep(0.0, 1.0, lit);
}

vec3 shade(vec3 p, float t) {
  vec3 n = terrainNormal(p, t);

  // Snow only on high ground, and only where it's flat enough to settle.
  float snowLine = 1.0 + 0.4 * noise(p.xz * 0.8).x;
  float snow = smoothstep(snowLine - 0.3, snowLine + 0.3, p.y)
             * smoothstep(0.45, 0.7, n.y + 0.15 * noise(p.xz * 6.0).x);
  vec3 albedo = mix(vec3(0.05, 0.05, 0.06), vec3(0.9, 0.94, 1.0), snow);

  float diffuse = max(dot(n, MOON_DIR), 0.0) * shadow(p + n * 0.01);
  vec3 light = vec3(0.6, 0.68, 0.85) * diffuse
             + vec3(0.07, 0.09, 0.13) * (0.5 + 0.5 * n.y);
  return albedo * light;
}

void main() {
  // Scaled by height and centered, so a narrower canvas crops the sides
  // rather than shrinking the scene.
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  const float pitch = 0.09;
  vec3 origin = vec3(7.0, 0.55, 0.0);
  vec3 forward = vec3(0.0, sin(pitch), cos(pitch));
  vec3 up = vec3(0.0, cos(pitch), -sin(pitch));
  vec3 dir = normalize(uv.x * vec3(1.0, 0.0, 0.0) + uv.y * up + 2.4 * forward);

  float t = march(origin, dir);
  if (t >= FAR) {
    // Leave the sky transparent so the page background shows through.
    outColor = vec4(0.0);
    return;
  }

  vec3 color = shade(origin + dir * t, t);
  // Fade distant terrain into the page background, and never end abruptly at
  // the top edge of the canvas.
  float alpha = exp(-0.03 * t) * (1.0 - smoothstep(0.36, 0.5, uv.y));

  // The canvas uses premultiplied alpha.
  outColor = vec4(pow(color, vec3(1.0 / 2.2)) * alpha, alpha);
}
