// Carries the culture over into a resized grid. Cells are anchored to CSS
// pixels, so existing growth stays put and new area starts as fresh medium.

uniform sampler2D uState;
uniform ivec2 uFrom;

out vec4 outState;

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  if (c.x < uFrom.x && c.y < uFrom.y) {
    outState = texelFetch(uState, c, 0);
  } else {
    outState = vec4(1.0, 0.0, 0.0, 0.0);
  }
}
