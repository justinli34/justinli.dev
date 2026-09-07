import { createSkyRenderer } from "./renderer";

const STRIPE_WIDTH_PX = 31;
const SLICE_FADE_MS = 400;
// This is ambience, not a game: cap both frame rate and render resolution.
const FRAME_INTERVAL_MS = 1000 / 24;
const MAX_PIXELS = 700_000;
const MAX_PIXEL_RATIO = 1.5;

type SliceFade = { from: number; to: number; started: number };

export function initReededSky() {
  const mount = document.querySelector<HTMLElement>(".sky-window");
  const canvas = mount?.querySelector<HTMLCanvasElement>(".sky-canvas");
  const controls = mount?.querySelector<HTMLElement>(".sky-slices");
  if (!mount || !canvas || !controls) return;

  mountReededSky(mount, canvas, controls);
}

function mountReededSky(
  mount: HTMLElement,
  canvas: HTMLCanvasElement,
  controls: HTMLElement,
) {
  const renderer = createSkyRenderer(canvas);
  if (!renderer) return;
  const { draw: render, dispose: disposeRenderer } = renderer;

  let glass = new Uint8Array(0);
  let sliceFades: SliceFade[] = [];
  let renderedGlass = new Uint8Array(0);

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reducedMotion.matches;
  let visible = true;
  let lost = false;
  let disposed = false;
  let animationFrame = 0;
  let previous = 0;
  let elapsed = 0;
  let dragPointer: number | null = null;
  let dragGlass = 0;
  let previousSlice: number | null = null;

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
    if (lost || disposed) return;
    const now = performance.now();
    sliceFades.forEach((fade, index) => {
      renderedGlass[index] = Math.round(sampleFade(fade, now));
    });
    render(renderedGlass, elapsed);
  }

  function canAnimate() {
    return !paused && visible && !document.hidden && !lost && !disposed;
  }

  function frame(now: number) {
    animationFrame = 0;
    if (!canAnimate()) return;
    if (!previous) previous = now;
    const delta = now - previous;
    if (delta >= FRAME_INTERVAL_MS) {
      elapsed += Math.min(delta, 100) / 1000;
      previous = now;
      draw();
    }
    animationFrame = requestAnimationFrame(frame);
  }

  function syncAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previous = 0;
    if (canAnimate()) {
      animationFrame = requestAnimationFrame(frame);
    }
  }

  function updateSlices() {
    if (lost || disposed) return;
    const now = performance.now();
    sliceFades.forEach((fade, index) => {
      if (fade.to === glass[index]) return;
      // Reverse from the current shade, rather than snapping to an endpoint.
      fade.from = sampleFade(fade, now);
      fade.to = glass[index];
      fade.started = now;
    });
    Array.from(controls.children).forEach((button, index) => {
      button.setAttribute("aria-pressed", String(glass[index] === 255));
    });
    draw();
  }

  function rebuildSlices(count: number) {
    const oldGlass = glass;
    const oldFades = sliceFades;
    // Preserve the spatial pattern when the responsive glass changes size.
    glass = Uint8Array.from({ length: count }, (_, index) =>
      oldGlass.length
        ? oldGlass[Math.floor(((index + 0.5) * oldGlass.length) / count)]
        : 255,
    );
    sliceFades = Array.from({ length: count }, (_, index) => {
      const oldFade =
        oldFades[Math.floor(((index + 0.5) * oldFades.length) / count)];
      return oldFade
        ? { ...oldFade }
        : { from: glass[index], to: glass[index], started: 0 };
    });
    renderedGlass = new Uint8Array(count);
    const buttons = Array.from({ length: count }, (_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.slice = String(index);
      button.setAttribute("aria-label", `Slice ${index + 1} glass`);
      return button;
    });
    controls.replaceChildren(...buttons);
    updateSlices();
  }

  function resize() {
    if (disposed) return;
    const { width, height } = mount.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const scale = Math.min(
      dpr,
      Math.sqrt(MAX_PIXELS / Math.max(1, width * height)),
    );
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const count = Math.max(1, Math.round(mount.clientWidth / STRIPE_WIDTH_PX));
    if (count !== glass.length) rebuildSlices(count);
    draw();
  }

  function sliceAtPointer(event: PointerEvent) {
    const rect = controls.getBoundingClientRect();
    if (!rect.width || event.clientY < rect.top || event.clientY > rect.bottom)
      return null;
    return Math.max(
      0,
      Math.min(
        glass.length - 1,
        Math.floor(((event.clientX - rect.left) / rect.width) * glass.length),
      ),
    );
  }

  function paintTo(index: number) {
    const start = previousSlice ?? index;
    let changed = false;
    // Fill skipped slices too, even when a quick swipe has few pointer events.
    for (let i = Math.min(start, index); i <= Math.max(start, index); i++) {
      if (glass[i] === dragGlass) continue;
      glass[i] = dragGlass;
      changed = true;
    }
    previousSlice = index;
    if (changed) updateSlices();
  }

  function endDrag() {
    const pointerId = dragPointer;
    dragPointer = null;
    previousSlice = null;
    if (pointerId !== null && controls.hasPointerCapture(pointerId)) {
      controls.releasePointerCapture(pointerId);
    }
  }

  const controller = new AbortController();
  const options = { signal: controller.signal };

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
      dragGlass = glass[index] ? 0 : 255;
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
      if (!Number.isInteger(index) || index < 0 || index >= glass.length)
        return;
      glass[index] = glass[index] ? 0 : 255;
      updateSlices();
    },
    options,
  );
  reducedMotion.addEventListener(
    "change",
    () => {
      paused = reducedMotion.matches;
      if (paused) {
        sliceFades.forEach((fade) => {
          fade.from = fade.to;
        });
      }
      draw();
      syncAnimation();
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
    if (disposed) return;
    endDrag();
    disposed = true;
    cancelAnimationFrame(animationFrame);
    controller.abort();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    controls.replaceChildren();
    disposeRenderer();
  }
  // Preserve the renderer when the browser puts this page into its back/forward cache.
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) dispose();
    },
    options,
  );
  document.addEventListener("astro:before-swap", dispose, options);
  if (import.meta.hot) import.meta.hot.dispose(dispose);

  mount.hidden = false;
  resize();
  syncAnimation();
}
