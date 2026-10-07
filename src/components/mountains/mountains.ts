import fragmentSource from "./mountains.frag?raw";

// A single triangle that covers the whole viewport.
const vertexSource = `#version 300 es
void main() {
  gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0);
}
`;

// The scene is static and only renders on resize, but cap the scale so very
// dense screens don't stall on that render.
const MAX_SCALE = 2;

const mounted = new WeakSet<HTMLElement>();

export function initMountains() {
  const root = document.querySelector<HTMLElement>(".mountains");
  const canvas = root?.querySelector("canvas");
  if (!root || !canvas || mounted.has(root)) return;
  mounted.add(root);
  mount(root, canvas);
}

function createScene(gl: WebGL2RenderingContext): (() => void) | null {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("Mountains:", gl.getShaderInfoLog(shader));
      return null;
    }
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Mountains:", gl.getProgramInfoLog(program));
    return null;
  }

  gl.useProgram(program);
  const resolution = gl.getUniformLocation(program, "uResolution");

  return () => {
    const { width, height } = gl.canvas;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(resolution, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

function mount(root: HTMLElement, canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  let drawScene = gl && createScene(gl);
  if (!gl || !drawScene) {
    root.hidden = true;
    return;
  }

  function draw() {
    drawScene?.();
    root.dataset.ready = "";
  }

  new ResizeObserver(() => {
    const scale = Math.min(devicePixelRatio, MAX_SCALE);
    canvas.width = Math.max(1, Math.round(root.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(root.clientHeight * scale));
    // Resizing clears the canvas, so repaint right away.
    draw();
  }).observe(root);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    drawScene = null;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    drawScene = createScene(gl);
    draw();
  });
}
