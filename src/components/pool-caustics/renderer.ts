import shaderSource from "./shader.glsl?raw";

// Original shader by mionrin: https://www.shadertoy.com/user/mionrin
const vertexSource = `#version 300 es
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
precision highp float;
uniform vec3 iResolution;
uniform vec2 uCssResolution;
uniform vec2 uRenderScale;
uniform float iTime;
out vec4 outputColor;
${shaderSource}
void main() {
  vec2 fragCoord = gl_FragCoord.xy / uRenderScale
                 - 0.5 * uCssResolution
                 + 0.5 * iResolution.xy;
  mainImage(outputColor, fragCoord);
}
`;

export function createPoolCausticsRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    stencil: false,
  });
  if (!context) return null;
  const gl = context;

  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();

  function dispose() {
    for (const shader of shaders) gl.deleteShader(shader);
    if (program) gl.deleteProgram(program);
  }

  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not allocate a shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(
        gl.getShaderInfoLog(shader) ?? "Shader compilation failed",
      );
    }
    return shader;
  }

  try {
    if (!program) throw new Error("Could not allocate a shader program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Shader linking failed");
    }

    gl.useProgram(program);
    const resolution = gl.getUniformLocation(program, "iResolution");
    const cssResolution = gl.getUniformLocation(program, "uCssResolution");
    const renderScale = gl.getUniformLocation(program, "uRenderScale");
    const time = gl.getUniformLocation(program, "iTime");
    const canonicalSize = 600;
    let width = 0;
    let height = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    gl.uniform3f(resolution, canonicalSize, canonicalSize, 1);

    return {
      draw(elapsed: number, displayWidth: number, displayHeight: number) {
        if (width !== canvas.width || height !== canvas.height) {
          width = canvas.width;
          height = canvas.height;
          gl.viewport(0, 0, width, height);
        }
        if (cssWidth !== displayWidth || cssHeight !== displayHeight) {
          cssWidth = displayWidth;
          cssHeight = displayHeight;
          gl.uniform2f(cssResolution, cssWidth, cssHeight);
        }
        gl.uniform2f(renderScale, width / cssWidth, height / cssHeight);
        gl.uniform1f(time, elapsed);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch (error) {
    console.warn("Pool Caustics:", error);
    dispose();
    return null;
  }
}
