import { selectTheme } from "./theme";

// An original light study: a procedural cloudscape seen through cylindrical reeds.
// Keep the artwork hidden unless WebGL initializes.
const STRIPE_WIDTH_PX = 31;
const SLICE_FADE_MS = 400;

type SliceFade = { from: number; to: number; started: number };
const vertexSource = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_slice_nights;
uniform float u_reeds;
uniform vec2 u_pointer;

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

vec3 sky(vec2 uv, float nightAmount) {
  float height = clamp(uv.y, 0.0, 1.0);
  vec3 day = mix(vec3(0.64, 0.81, 0.79), vec3(0.16, 0.48, 0.67), pow(height, 0.75));
  vec3 night = mix(vec3(0.16, 0.28, 0.34), vec3(0.025, 0.065, 0.14), height);
  vec3 color = mix(day, night, nightAmount);
  vec2 p = vec2(uv.x * 4.4, uv.y * 1.65);
  p.x += sin(u_time * 0.022) * 0.6;
  p.y += sin(u_time * 0.017) * 0.045;
  float cloud = clouds(p);
  float shade = clouds(p + vec2(0.055, 0.085));
  float light = clamp(0.72 + (cloud - shade) * 1.9, 0.0, 1.0);
  vec3 dayCloud = mix(vec3(0.54, 0.70, 0.73), vec3(1.0, 0.985, 0.91), light);
  vec3 nightCloud = mix(vec3(0.16, 0.23, 0.31), vec3(0.51, 0.61, 0.69), light);
  color = mix(color, mix(dayCloud, nightCloud, nightAmount), cloud * 0.96);

  // Diffuse sunlight / moonlight, rather than a hard disc behind the glass.
  vec2 glowPosition = uv - vec2(0.78, 0.8);
  float glow = exp(-dot(glowPosition * vec2(1.0, 0.8), glowPosition * vec2(1.0, 0.8)) * 17.0);
  color += glow * mix(vec3(0.11, 0.105, 0.065), vec3(0.08, 0.105, 0.13), nightAmount);
  return color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float cell = floor(uv.x * u_reeds);
  float nightAmount = texture2D(u_slice_nights, vec2((cell + 0.5) / u_reeds, 0.5)).r;
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
  sampleUV += u_pointer * vec2(0.012, 0.007);
  vec3 color = sky(sampleUV, nightAmount);

  float edge = pow(abs(x), 9.0);
  float fresnel = 0.035 + 0.6 * pow(1.0 - normal.z, 3.0);
  color *= 1.0 - edge * 0.22;
  color *= vec3(0.94, 0.99, 0.985);
  color = mix(color, mix(vec3(0.56, 0.77, 0.79), vec3(0.18, 0.3, 0.39), nightAmount), fresnel);

  // Narrow reflected light and its neighboring trough make each flute read as glass.
  float highlight = exp(-pow((local - 0.87 - waviness * 0.4) / 0.035, 2.0));
  float secondary = exp(-pow((local - 0.12) / 0.065, 2.0));
  float trough = exp(-pow((local - 0.965) / 0.028, 2.0));
  float sheen = 0.7 + 0.3 * sin(uv.y * 3.0 + seed * 0.4);
  color += (highlight * 0.24 + secondary * 0.075) * sheen
           * mix(vec3(0.76, 0.96, 0.93), vec3(0.28, 0.48, 0.6), nightAmount);
  color -= trough * mix(vec3(0.09, 0.14, 0.14), vec3(0.025, 0.045, 0.06), nightAmount);
  color += vec3(0.018, 0.006, -0.009) * highlight;
  float vignette = 1.0 - 0.13 * pow(length((uv - 0.5) * vec2(0.8, 1.1)), 1.6);
  color *= vignette;
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.008;
  gl_FragColor = vec4(color, 1.0);
}
`;

export function initReededSky() {
  const canvas = document.querySelector<HTMLCanvasElement>(".sky-canvas");
  const mount = document.querySelector<HTMLElement>(".sky-window");
  const controls = mount?.querySelector<HTMLElement>(".sky-slices");
  if (!canvas || !mount || !controls) return;

  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) return;

  function compile(type: number, source: string) {
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return;
  }

  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const time = gl.getUniformLocation(program, "u_time");
  const sliceNights = gl.createTexture();
  if (!sliceNights) {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, sliceNights);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_slice_nights"), 0);
  let nights = new Uint8Array(0);
  let sliceFades: SliceFade[] = [];
  let renderedNights = new Uint8Array(0);
  const reeds = gl.getUniformLocation(program, "u_reeds");
  const pointer = gl.getUniformLocation(program, "u_pointer");

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reducedMotion.matches;
  let visible = true;
  let lost = false;
  let disposed = false;
  let animationFrame = 0;
  let previous = 0;
  let elapsed = 0;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  function sampleFade(fade: SliceFade, now: number) {
    if (paused) return fade.to;
    const progress = Math.min(
      1,
      Math.max(0, (now - fade.started) / SLICE_FADE_MS),
    );
    const eased = progress * progress * (3 - 2 * progress);
    return fade.from + (fade.to - fade.from) * eased;
  }

  function draw() {
    if (!gl || !canvas || lost || disposed) return;
    const now = performance.now();
    sliceFades.forEach((fade, index) => {
      renderedNights[index] = Math.round(sampleFade(fade, now));
    });
    gl.bindTexture(gl.TEXTURE_2D, sliceNights);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      renderedNights.length,
      1,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      renderedNights,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, elapsed);
    gl.uniform1f(reeds, nights.length);
    gl.uniform2f(pointer, pointerX, pointerY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now: number) {
    animationFrame = 0;
    if (paused || !visible || document.hidden || lost || disposed) return;
    if (!previous) previous = now;
    const delta = now - previous;
    // Limit rendering to 24fps and under 700k pixels: this is ambience, not a game.
    if (delta >= 1000 / 24) {
      elapsed += Math.min(delta, 100) / 1000;
      previous = now;
      pointerX += (targetX - pointerX) * 0.035;
      pointerY += (targetY - pointerY) * 0.035;
      draw();
    }
    animationFrame = requestAnimationFrame(frame);
  }

  function syncAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previous = 0;
    if (!paused && visible && !document.hidden && !lost && !disposed) {
      animationFrame = requestAnimationFrame(frame);
    }
  }

  function updateSlices() {
    if (!gl || !controls || lost || disposed) return;
    const now = performance.now();
    sliceFades.forEach((fade, index) => {
      if (fade.to === nights[index]) return;
      // Reverse from the current shade, rather than snapping to an endpoint.
      fade.from = sampleFade(fade, now);
      fade.to = nights[index];
      fade.started = now;
    });
    Array.from(controls.children).forEach((button, index) => {
      button.setAttribute("aria-pressed", String(nights[index] === 255));
    });
    draw();
  }

  function syncSiteTheme() {
    // Start the site fade immediately when all slices match.
    if (
      lost ||
      disposed ||
      !nights.length ||
      !nights.every((value) => value === nights[0])
    )
      return;
    selectTheme(nights[0] === 255 ? "dark" : "light");
  }

  function resize() {
    if (!canvas || !mount || disposed) return;
    const { width, height } = mount.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = Math.min(
      dpr,
      Math.sqrt(700000 / Math.max(1, width * height)),
    );
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const count = Math.max(1, Math.round(mount.clientWidth / STRIPE_WIDTH_PX));
    if (count !== nights.length && controls) {
      const oldNights = nights;
      const oldFades = sliceFades;
      const initialNight =
        document.documentElement.dataset.theme === "dark" ? 255 : 0;
      // Preserve the spatial pattern when the responsive glass changes size.
      nights = Uint8Array.from({ length: count }, (_, index) =>
        oldNights.length
          ? oldNights[Math.floor(((index + 0.5) * oldNights.length) / count)]
          : initialNight,
      );
      sliceFades = Array.from({ length: count }, (_, index) => {
        const oldFade =
          oldFades[Math.floor(((index + 0.5) * oldFades.length) / count)];
        return oldFade
          ? { ...oldFade }
          : { from: nights[index], to: nights[index], started: 0 };
      });
      renderedNights = new Uint8Array(count);
      const buttons = Array.from({ length: count }, (_, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.slice = String(index);
        button.setAttribute("aria-label", `Slice ${index + 1} night mode`);
        return button;
      });
      controls.replaceChildren(...buttons);
      updateSlices();
      if (oldNights.length) syncSiteTheme();
    }
    draw();
  }

  const controller = new AbortController();
  const options = { signal: controller.signal };
  reducedMotion.addEventListener(
    "change",
    () => {
      paused = reducedMotion.matches;
      if (paused) {
        sliceFades.forEach((fade) => {
          fade.from = fade.to;
        });
        syncSiteTheme();
      }
      pointerX = pointerY = targetX = targetY = 0;
      draw();
      syncAnimation();
    },
    options,
  );
  mount.addEventListener(
    "pointermove",
    (event) => {
      if (paused || reducedMotion.matches || event.pointerType === "touch")
        return;
      const rect = mount.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width - 0.5;
      targetY = (event.clientY - rect.top) / rect.height - 0.5;
    },
    { ...options, passive: true },
  );
  mount.addEventListener(
    "pointerleave",
    () => {
      targetX = targetY = 0;
    },
    options,
  );
  let dragPointer: number | null = null;
  let dragNight = 0;
  let previousSlice: number | null = null;

  function sliceAtPointer(event: PointerEvent) {
    const rect = controls?.getBoundingClientRect();
    if (!rect?.width || event.clientY < rect.top || event.clientY > rect.bottom)
      return null;
    return Math.max(
      0,
      Math.min(
        nights.length - 1,
        Math.floor(((event.clientX - rect.left) / rect.width) * nights.length),
      ),
    );
  }

  function paintTo(index: number) {
    const start = previousSlice ?? index;
    let changed = false;
    // Fill skipped slices too, even when a quick swipe has few pointer events.
    for (let i = Math.min(start, index); i <= Math.max(start, index); i++) {
      if (nights[i] === dragNight) continue;
      nights[i] = dragNight;
      changed = true;
    }
    previousSlice = index;
    if (changed) {
      updateSlices();
      syncSiteTheme();
    }
  }

  function endDrag() {
    const pointerId = dragPointer;
    dragPointer = previousSlice = null;
    if (pointerId !== null && controls?.hasPointerCapture(pointerId)) {
      controls.releasePointerCapture(pointerId);
    }
  }

  controls.addEventListener(
    "pointerdown",
    (event) => {
      if (
        lost ||
        disposed ||
        !event.isPrimary ||
        event.button !== 0 ||
        dragPointer !== null
      )
        return;
      const index = sliceAtPointer(event);
      if (index === null) return;
      dragPointer = event.pointerId;
      dragNight = nights[index] ? 0 : 255;
      previousSlice = null;
      controls.setPointerCapture(event.pointerId);
      paintTo(index);
    },
    options,
  );
  controls.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerId !== dragPointer || lost || disposed) return;
      if (!(event.buttons & 1)) {
        endDrag();
        return;
      }
      const index = sliceAtPointer(event);
      if (index === null) previousSlice = null;
      else paintTo(index);
    },
    options,
  );
  for (const type of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const) {
    controls.addEventListener(
      type,
      (event) => {
        if (event.pointerId === dragPointer) endDrag();
      },
      options,
    );
  }
  window.addEventListener("blur", endDrag, options);
  window.addEventListener("resize", endDrag, options);

  controls.addEventListener(
    "click",
    (event) => {
      // Pointer gestures are handled above; keep keyboard/assistive clicks working.
      if (
        event.detail !== 0 ||
        lost ||
        disposed ||
        !(event.target instanceof HTMLButtonElement)
      )
        return;
      const index = Number(event.target.dataset.slice);
      if (!Number.isInteger(index) || index < 0 || index >= nights.length)
        return;
      nights[index] = nights[index] ? 0 : 255;
      updateSlices();
      syncSiteTheme();
    },
    options,
  );
  document.addEventListener(
    "themechange",
    () => {
      nights.fill(document.documentElement.dataset.theme === "dark" ? 255 : 0);
      updateSlices();
    },
    options,
  );
  document.addEventListener("visibilitychange", syncAnimation, options);
  window.addEventListener("resize", resize, { ...options, passive: true });
  canvas.addEventListener(
    "webglcontextlost",
    () => {
      lost = true;
      mount.hidden = true;
      syncAnimation();
    },
    options,
  );

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncAnimation();
  });
  intersectionObserver.observe(mount);

  function dispose() {
    endDrag();
    disposed = true;
    cancelAnimationFrame(animationFrame);
    controller.abort();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    gl?.deleteTexture(sliceNights);
    controls?.replaceChildren();
    gl?.deleteBuffer(buffer);
    gl?.deleteProgram(program);
  }
  // Preserve the renderer when the browser puts this page into its back/forward cache.
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) dispose();
    },
    options,
  );
  if (import.meta.hot) import.meta.hot.dispose(dispose);

  mount.hidden = false;
  resize();
  syncAnimation();
}
