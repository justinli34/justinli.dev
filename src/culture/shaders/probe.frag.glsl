// Downsamples the culture into a coverage map small enough to read back.

uniform sampler2D uState;
uniform ivec2 uGrid;
uniform vec2 uProbe;

out vec4 outColor;

void main() {
  vec2 cellsPerTexel = vec2(uGrid) / uProbe;
  vec2 origin = floor(gl_FragCoord.xy) * cellsPerTexel;
  float covered = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      ivec2 c = ivec2(origin + (vec2(x, y) + 0.5) * cellsPerTexel / 4.0);
      covered += step(0.12, texelFetch(uState, clamp(c, ivec2(0), uGrid - 1), 0).y);
    }
  }
  outColor = vec4(covered / 16.0, 0.0, 0.0, 1.0);
}
