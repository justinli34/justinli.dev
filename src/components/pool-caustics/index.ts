import { createPoolCausticsRenderer } from "./renderer";

export function initPoolCaustics() {
  for (const mount of document.querySelectorAll<HTMLElement>(
    ".pool-caustics:not([data-mounted])",
  )) {
    const canvas = mount.querySelector<HTMLCanvasElement>("canvas");
    if (canvas) mountPoolCaustics(mount, canvas);
  }
}

function mountPoolCaustics(mount: HTMLElement, canvas: HTMLCanvasElement) {
  const renderer = createPoolCausticsRenderer(canvas);
  if (!renderer) return;

  mount.dataset.mounted = "";
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motion.matches;
  let active = true;
  let disposed = false;
  let frameId = 0;
  let lastDraw = 0;
  let elapsed = 0;
  let displayWidth = 1;
  let displayHeight = 1;

  function resize() {
    const bounds = mount.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const sizeChanged = width !== displayWidth || height !== displayHeight;
    displayWidth = width;
    displayHeight = height;
    const scale = Math.min(
      devicePixelRatio || 1,
      1.5,
      Math.sqrt(1_200_000 / (width * height)),
    );
    const bufferWidth = Math.max(1, Math.round((width * scale) / 32) * 32);
    const bufferHeight = Math.max(1, Math.round((height * scale) / 32) * 32);
    const changed =
      canvas.width !== bufferWidth || canvas.height !== bufferHeight;
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;

    // Resizing clears a WebGL drawing buffer. Repaint in the same task so the
    // cleared buffer is never composited as a black frame.
    if ((changed || sizeChanged) && active && !document.hidden) {
      draw(performance.now());
    } else requestDraw();
  }

  function draw(now: number) {
    if (!reduced && lastDraw !== 0) {
      elapsed += Math.min(now - lastDraw, 100) / 1000;
    }
    renderer?.draw(reduced ? 0 : elapsed, displayWidth, displayHeight);
    mount.dataset.rendered = "";
    lastDraw = now;
  }

  function frame(now: number) {
    frameId = 0;
    if (disposed || !active || document.hidden) return;

    if (reduced || lastDraw === 0 || now - lastDraw >= 1000 / 30) draw(now);

    if (!reduced) requestDraw();
  }

  function requestDraw() {
    if (!frameId && !disposed && active && !document.hidden) {
      frameId = requestAnimationFrame(frame);
    }
  }

  function syncMotion() {
    reduced = motion.matches;
    lastDraw = 0;
    requestDraw();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    active = entry?.isIntersecting ?? false;
    lastDraw = 0;
    requestDraw();
  });
  intersectionObserver.observe(mount);

  window.addEventListener("resize", resize, { ...options, passive: true });
  document.addEventListener(
    "visibilitychange",
    () => {
      lastDraw = 0;
      requestDraw();
    },
    options,
  );
  motion.addEventListener("change", syncMotion, options);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    controller.abort();
    renderer?.dispose();
    delete mount.dataset.mounted;
    delete mount.dataset.rendered;
  }

  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      dispose();
    },
    options,
  );
  document.addEventListener("astro:before-swap", dispose, options);
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) dispose();
    },
    options,
  );
  window.addEventListener("pageshow", requestDraw, options);
  if (import.meta.hot) import.meta.hot.dispose(dispose);

  resize();
}
