export const vertexSource = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

export const fragmentSource = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_slice_glass;
uniform float u_reeds;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7;
    amplitude *= 0.5;
  }
  return value;
}

float clouds(vec2 p) {
  float billow = fbm(p * 3.1);
  float detail = fbm(p * 8.0 + billow);
  float leftBank = 1.0 - length((p - vec2(0.65, 0.05)) / vec2(1.9, 0.92));
  float rightBank = 1.0 - length((p - vec2(3.55, 1.15)) / vec2(1.55, 0.54));
  float wisps = 1.0 - length((p - vec2(2.9, -0.15)) / vec2(2.8, 0.5));
  float shape = max(max(leftBank, rightBank), wisps);
  return smoothstep(0.10, 0.57, shape + (billow - 0.5) * 1.35 + (detail - 0.5) * 0.26);
}

vec3 sky(vec2 uv) {
  float height = clamp(uv.y, 0.0, 1.0);
  vec3 color = mix(vec3(0.64, 0.81, 0.87), vec3(0.16, 0.48, 0.67), pow(height, 0.75));
  vec2 p = vec2(uv.x * 4.4, uv.y * 1.65);
  p.x += sin(u_time * 0.022) * 0.6;
  p.y += sin(u_time * 0.017) * 0.045;
  float cloud = clouds(p);
  float shade = clouds(p + vec2(0.055, 0.085));
  float light = clamp(0.72 + (cloud - shade) * 1.9, 0.0, 1.0);
  vec3 cloudColor = mix(vec3(0.54, 0.70, 0.73), vec3(0.97, 0.985, 1.0), light);
  color = mix(color, cloudColor, cloud * 0.96);

  // Diffuse sunlight, rather than a hard disc behind the glass.
  vec2 glowPosition = uv - vec2(0.78, 0.8);
  float glow = exp(-dot(glowPosition * vec2(1.0, 0.8), glowPosition * vec2(1.0, 0.8)) * 17.0);
  color += glow * vec3(0.095, 0.105, 0.11);
  return color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float cell = floor(uv.x * u_reeds);
  float glassAmount = texture2D(u_slice_glass, vec2((cell + 0.5) / u_reeds, 0.5)).r;
  float local = fract(uv.x * u_reeds);
  float x = local * 2.0 - 1.0;
  float seed = hash(vec2(cell, 8.4));
  float waviness = sin(uv.y * 10.0 + seed * 6.28) * 0.018
                 + sin(uv.y * 31.0 + seed * 19.0) * 0.005;
  float normalX = clamp(x * 0.91 + waviness, -0.98, 0.98);
  vec3 normal = normalize(vec3(normalX, waviness * 0.15, sqrt(1.0 - normalX * normalX)));
  vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.52);
  vec2 sampleUV = uv;
  sampleUV.x += ray.x / max(-ray.z, 0.2) * 0.055;
  sampleUV.y += sin(local * 3.14159) * 0.009 + waviness * 0.035;
  vec3 color = sky(sampleUV);

  float edge = pow(abs(x), 9.0);
  float fresnel = 0.035 + 0.6 * pow(1.0 - normal.z, 3.0);
  color *= 1.0 - edge * 0.22;
  color *= vec3(0.94, 0.99, 1.0);
  color = mix(color, vec3(0.56, 0.77, 0.79), fresnel);

  // Narrow reflected light and its neighboring trough make each flute read as glass.
  float highlight = exp(-pow((local - 0.87 - waviness * 0.4) / 0.035, 2.0));
  float secondary = exp(-pow((local - 0.12) / 0.065, 2.0));
  float trough = exp(-pow((local - 0.965) / 0.028, 2.0));
  float sheen = 0.7 + 0.3 * sin(uv.y * 3.0 + seed * 0.4);
  color += (highlight * 0.24 + secondary * 0.075) * sheen
           * vec3(0.76, 0.96, 1.0);
  color -= trough * vec3(0.09, 0.14, 0.14);
  color += vec3(0.006, 0.012, 0.018) * highlight;
  // With glass removed, show the same sky without refraction, tint or reflections.
  vec3 clearSky = sky(uv);
  color = mix(clearSky, color, glassAmount);
  float vignette = 1.0 - 0.13 * pow(length((uv - 0.5) * vec2(0.8, 1.1)), 1.6);
  color *= vignette;
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.008;
  gl_FragColor = vec4(color, 1.0);
}
`;
