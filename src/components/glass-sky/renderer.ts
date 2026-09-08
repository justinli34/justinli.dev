import { glassSource, skySource, vertexSource } from "./shaders";

export function createGlassRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const programs: WebGLProgram[] = [];
  const shaders: WebGLShader[] = [];
  const sky = gl.createTexture();
  const framebuffer = gl.createFramebuffer();

  function dispose() {
    for (const program of programs) gl?.deleteProgram(program);
    for (const shader of shaders) gl?.deleteShader(shader);
    gl?.deleteTexture(sky);
    gl?.deleteFramebuffer(framebuffer);
  }

  function program(fragmentSource: string) {
    if (!gl) throw new Error("WebGL unavailable");
    const result = gl.createProgram();
    if (!result) throw new Error("Could not allocate a glass program");
    programs.push(result);
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not allocate a glass shader");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "Glass shader failed");
      }
      gl.attachShader(result, shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(result) ?? "Glass program failed");
    }
    return result;
  }

  try {
    if (!sky || !framebuffer) throw new Error("Could not allocate the sky");
    const skyProgram = program(skySource);
    const glassProgram = program(glassSource);
    // Bake the expensive cloud volume once; only the glass is animated.
    const skyWidth = 1024;
    const skyHeight = 745;
    gl.bindTexture(gl.TEXTURE_2D, sky);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      skyWidth,
      skyHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      sky,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Sky framebuffer incomplete");
    }
    gl.useProgram(skyProgram);
    gl.viewport(0, 0, skyWidth, skyHeight);
    gl.uniform2f(
      gl.getUniformLocation(skyProgram, "u_resolution"),
      skyWidth,
      skyHeight,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(glassProgram);
    gl.uniform1i(gl.getUniformLocation(glassProgram, "u_sky"), 0);

    const resolution = gl.getUniformLocation(glassProgram, "u_resolution");
    const grid = gl.getUniformLocation(glassProgram, "u_grid");
    const time = gl.getUniformLocation(glassProgram, "u_time");
    const morph = gl.getUniformLocation(glassProgram, "u_morph");
    const pointer = gl.getUniformLocation(glassProgram, "u_pointer");
    const aspect = gl.getUniformLocation(glassProgram, "u_aspect");
    let bufferWidth = 0;
    let bufferHeight = 0;
    let lastColumns = 0;
    let lastRows = 0;
    let lastProgress = -1;
    let lastRatio = 0;

    return {
      draw(
        columns: number,
        rows: number,
        progress: number,
        elapsed: number,
        x: number,
        y: number,
        ratio: number,
      ) {
        // Ambient frames only change time and light direction. WebGL retains
        // viewport/uniform state, including when the backing buffer is resized.
        if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
          bufferWidth = canvas.width;
          bufferHeight = canvas.height;
          gl.viewport(0, 0, bufferWidth, bufferHeight);
          gl.uniform2f(resolution, bufferWidth, bufferHeight);
        }
        if (columns !== lastColumns || rows !== lastRows) {
          gl.uniform2f(grid, columns, rows);
          lastColumns = columns;
          lastRows = rows;
        }
        if (progress !== lastProgress) {
          gl.uniform1f(morph, progress);
          lastProgress = progress;
        }
        if (ratio !== lastRatio) {
          gl.uniform1f(aspect, ratio);
          lastRatio = ratio;
        }
        gl.uniform1f(time, elapsed);
        gl.uniform2f(pointer, x, y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch (error) {
    console.warn("Glass Sky:", error);
    dispose();
    return null;
  }
}
