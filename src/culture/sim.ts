import displaySource from "./shaders/display.frag.glsl?raw";
import influenceSource from "./shaders/influence.frag.glsl?raw";
import probeSource from "./shaders/probe.frag.glsl?raw";
import resampleSource from "./shaders/resample.frag.glsl?raw";
import simSource from "./shaders/sim.frag.glsl?raw";

export const MAX_ZONES = 32;
export const MAX_STROKES = 24;
export const MAX_LENSES = 8;
const PROBE_WIDTH = 48;
const PROBE_HEIGHT = 30;

const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define MAX_ZONES ${MAX_ZONES}
#define MAX_STROKES ${MAX_STROKES}
#define MAX_LENSES ${MAX_LENSES}
`;

const vertexSource = `#version 300 es
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

export type Zones = {
  count: number;
  /** center x, center y, half width, half height per zone (CSS px) */
  boxes: Float32Array;
  /** corner radius, margin, feather, strength per zone */
  shapes: Float32Array;
};

export type Pointer = {
  /** Where a hovering pointer feeds the medium; radius 0 when it isn't. */
  feeder: { x: number; y: number; radius: number };
  /** Recent inoculation segments: x0, y0, x1, y1 each (CSS px). */
  strokes: Float32Array;
  strokeCount: number;
  strokeRadius: number;
};

export type Lenses = {
  count: number;
  /** center x, center y, radius (CSS px), hover (0..1) per lens */
  beads: Float32Array;
  /** How stained with ink each lens is (0..1): its window is open. */
  ink: Float32Array;
};

export type Palette = {
  /** medium, medium edge, pigment A, pigment B, visitor strain, highlight */
  bright: Float32Array;
  dark: Float32Array;
};

export type Culture = {
  readonly precision: "32f" | "16f";
  readonly width: number;
  readonly height: number;
  resize(width: number, height: number): void;
  load(state: Float32Array, field: Uint8Array): void;
  setField(field: Uint8Array): void;
  step(
    count: number,
    zones: Zones,
    pointer: Pointer,
    options: { strain: number; spores: number; nameRate: number },
  ): void;
  draw(options: {
    viewWidth: number;
    viewHeight: number;
    dark: number;
    reveal: number;
    feeder: Pointer["feeder"];
    lenses: Lenses;
    palette: Palette;
  }): void;
  coverage(): number;
  dispose(): void;
};

type Program = {
  program: WebGLProgram;
  uniform(name: string): WebGLUniformLocation | null;
};

export function createCulture(
  canvas: HTMLCanvasElement,
  cell: number,
): Culture | null {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!context) return null;
  const gl = context;

  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];
  const textures: WebGLTexture[] = [];
  const framebuffers: WebGLFramebuffer[] = [];

  function releaseAll() {
    for (const framebuffer of framebuffers) gl.deleteFramebuffer(framebuffer);
    for (const texture of textures) gl.deleteTexture(texture);
    for (const program of programs) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  }

  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not allocate a shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader failed");
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);

  function link(fragment: string): Program {
    const program = gl.createProgram();
    programs.push(program);
    gl.attachShader(program, vertex);
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, header + fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Program failed");
    }
    const locations = new Map<string, WebGLUniformLocation | null>();
    return {
      program,
      uniform(name) {
        if (!locations.has(name)) {
          locations.set(name, gl.getUniformLocation(program, name));
        }
        return locations.get(name) ?? null;
      },
    };
  }

  function texture(
    internalFormat: number,
    width: number,
    height: number,
    format: number,
    type: number,
    data: ArrayBufferView | null,
  ) {
    const handle = gl.createTexture();
    textures.push(handle);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      format,
      type,
      data,
    );
    return handle;
  }

  function target(handle: WebGLTexture) {
    const framebuffer = gl.createFramebuffer();
    framebuffers.push(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      handle,
      0,
    );
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return complete ? framebuffer : null;
  }

  function forget<T>(list: T[], item: T) {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
  }

  function destroyTexture(handle: WebGLTexture) {
    gl.deleteTexture(handle);
    forget(textures, handle);
  }

  function destroyTarget(framebuffer: WebGLFramebuffer) {
    gl.deleteFramebuffer(framebuffer);
    forget(framebuffers, framebuffer);
  }

  // Half floats lose the small differences Gray-Scott depends on, so prefer
  // full precision and only fall back when the GPU can't render to it.
  function pickPrecision(): "32f" | "16f" | null {
    const hasFloat = gl.getExtension("EXT_color_buffer_float");
    const hasHalf = hasFloat || gl.getExtension("EXT_color_buffer_half_float");
    const candidates: ["32f" | "16f", number][] = [];
    if (hasFloat) candidates.push(["32f", gl.RGBA32F]);
    if (hasHalf) candidates.push(["16f", gl.RGBA16F]);
    for (const [name, format] of candidates) {
      const probe = texture(format, 4, 4, gl.RGBA, gl.FLOAT, null);
      const framebuffer = target(probe);
      destroyTexture(probe);
      if (framebuffer) {
        destroyTarget(framebuffer);
        return name;
      }
    }
    return null;
  }

  try {
    const precision = pickPrecision();
    if (!precision) throw new Error("No renderable float textures");
    const stateFormat = precision === "32f" ? gl.RGBA32F : gl.RGBA16F;

    const sim = link(simSource);
    const influence = link(influenceSource);
    const display = link(displaySource);
    const probe = link(probeSource);
    const resample = link(resampleSource);

    let width = 0;
    let height = 0;
    let states: WebGLTexture[] = [];
    let targets: WebGLFramebuffer[] = [];
    let field: WebGLTexture | null = null;
    let influenceTexture: WebGLTexture | null = null;
    let influenceTarget: WebGLFramebuffer | null = null;
    let current = 0;

    const probeTexture = texture(
      gl.RGBA8,
      PROBE_WIDTH,
      PROBE_HEIGHT,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    const probeTarget = target(probeTexture);
    const probePixels = new Uint8Array(PROBE_WIDTH * PROBE_HEIGHT * 4);

    function allocate(nextWidth: number, nextHeight: number) {
      const nextStates = [0, 1].map(() =>
        texture(stateFormat, nextWidth, nextHeight, gl.RGBA, gl.FLOAT, null),
      );
      const nextTargets = nextStates.map((state) => {
        const framebuffer = target(state);
        if (!framebuffer) throw new Error("State texture is not renderable");
        return framebuffer;
      });
      return { nextStates, nextTargets };
    }

    function releaseField() {
      if (field) destroyTexture(field);
      if (influenceTexture) destroyTexture(influenceTexture);
      if (influenceTarget) destroyTarget(influenceTarget);
      field = null;
      influenceTexture = null;
      influenceTarget = null;
    }

    function release() {
      for (const state of states) destroyTexture(state);
      for (const framebuffer of targets) destroyTarget(framebuffer);
      states = [];
      targets = [];
      releaseField();
    }

    function bindQuad(program: Program, framebuffer: WebGLFramebuffer | null) {
      gl.useProgram(program.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    }

    function bindTexture(
      program: Program,
      name: string,
      unit: number,
      handle: WebGLTexture | null,
    ) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.uniform1i(program.uniform(name), unit);
    }

    return {
      precision,
      get width() {
        return width;
      },
      get height() {
        return height;
      },

      load(state, fieldData) {
        release();
        const { nextStates, nextTargets } = allocate(width, height);
        states = nextStates;
        targets = nextTargets;
        current = 0;
        gl.bindTexture(gl.TEXTURE_2D, states[0] ?? null);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          width,
          height,
          gl.RGBA,
          gl.FLOAT,
          state,
        );
        this.setField(fieldData);
      },

      resize(nextWidth, nextHeight) {
        if (nextWidth === width && nextHeight === height) return;
        const previous = states[current];
        const previousWidth = width;
        const previousHeight = height;
        width = nextWidth;
        height = nextHeight;
        if (!previous) return;

        const { nextStates, nextTargets } = allocate(width, height);
        bindQuad(resample, nextTargets[0] ?? null);
        gl.viewport(0, 0, width, height);
        bindTexture(resample, "uState", 0, previous);
        gl.uniform2i(resample.uniform("uFrom"), previousWidth, previousHeight);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        for (const state of states) destroyTexture(state);
        for (const framebuffer of targets) destroyTarget(framebuffer);
        states = nextStates;
        targets = nextTargets;
        current = 0;
      },

      setField(fieldData) {
        releaseField();
        field = texture(
          gl.RGBA8,
          width,
          height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          fieldData,
        );
        influenceTexture = texture(
          gl.RGBA8,
          width,
          height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        influenceTarget = target(influenceTexture);
      },

      step(count, zones, pointer, { strain, spores, nameRate }) {
        if (!states.length || !influenceTarget || count <= 0) return;
        gl.viewport(0, 0, width, height);

        // Rasterise this frame's zones and pointer once for all the steps.
        bindQuad(influence, influenceTarget);
        bindTexture(influence, "uField", 1, field);
        gl.uniform1f(influence.uniform("uCell"), cell);
        gl.uniform1i(influence.uniform("uZoneCount"), zones.count);
        gl.uniform4fv(influence.uniform("uZones[0]"), zones.boxes);
        gl.uniform4fv(influence.uniform("uZoneShapes[0]"), zones.shapes);
        const { feeder } = pointer;
        gl.uniform3f(
          influence.uniform("uFeeder"),
          feeder.x,
          feeder.y,
          feeder.radius,
        );
        gl.uniform1i(influence.uniform("uStrokeCount"), pointer.strokeCount);
        gl.uniform4fv(influence.uniform("uStrokes[0]"), pointer.strokes);
        gl.uniform1f(influence.uniform("uStrokeRadius"), pointer.strokeRadius);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.useProgram(sim.program);
        gl.uniform2i(sim.uniform("uGrid"), width, height);
        gl.uniform1f(sim.uniform("uStrain"), strain);
        gl.uniform1f(sim.uniform("uSpores"), spores);
        gl.uniform1f(sim.uniform("uNameRate"), nameRate);
        bindTexture(sim, "uField", 1, field);
        bindTexture(sim, "uInfluence", 2, influenceTexture);

        for (let index = 0; index < count; index++) {
          const next = 1 - current;
          gl.bindFramebuffer(gl.FRAMEBUFFER, targets[next] ?? null);
          bindTexture(sim, "uState", 0, states[current] ?? null);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          current = next;
        }
      },

      draw({ viewWidth, viewHeight, dark, reveal, feeder, lenses, palette }) {
        bindQuad(display, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        bindTexture(display, "uState", 0, states[current] ?? null);
        bindTexture(display, "uField", 1, field);
        gl.uniform2i(display.uniform("uGrid"), width, height);
        gl.uniform1f(display.uniform("uCell"), cell);
        gl.uniform2f(display.uniform("uView"), viewWidth, viewHeight);
        gl.uniform2f(display.uniform("uCanvas"), canvas.width, canvas.height);
        gl.uniform1f(display.uniform("uDark"), dark);
        gl.uniform1f(display.uniform("uReveal"), reveal);
        gl.uniform3f(
          display.uniform("uFeeder"),
          feeder.x,
          feeder.y,
          feeder.radius,
        );
        gl.uniform3fv(display.uniform("uBright[0]"), palette.bright);
        gl.uniform3fv(display.uniform("uDarkfield[0]"), palette.dark);
        gl.uniform1i(display.uniform("uLensCount"), lenses.count);
        gl.uniform4fv(display.uniform("uLenses[0]"), lenses.beads);
        gl.uniform1fv(display.uniform("uLensInk[0]"), lenses.ink);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },

      coverage() {
        if (!probeTarget || !states.length) return 0;
        bindQuad(probe, probeTarget);
        gl.viewport(0, 0, PROBE_WIDTH, PROBE_HEIGHT);
        bindTexture(probe, "uState", 0, states[current] ?? null);
        gl.uniform2i(probe.uniform("uGrid"), width, height);
        gl.uniform2f(probe.uniform("uProbe"), PROBE_WIDTH, PROBE_HEIGHT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(
          0,
          0,
          PROBE_WIDTH,
          PROBE_HEIGHT,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          probePixels,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let sum = 0;
        for (let index = 0; index < probePixels.length; index += 4) {
          sum += probePixels[index] ?? 0;
        }
        return sum / (255 * PROBE_WIDTH * PROBE_HEIGHT);
      },

      dispose: releaseAll,
    };
  } catch (error) {
    console.warn("Culture:", error);
    releaseAll();
    return null;
  }
}
