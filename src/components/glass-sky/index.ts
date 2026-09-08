import { createGlassRenderer } from "./renderer";
import { skyAspect } from "./shaders";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function initGlassSky() {
  const mount = document.querySelector<HTMLElement>(".glass-sky");
  const canvas = mount?.querySelector<HTMLCanvasElement>("canvas");
  const shell = document.querySelector<HTMLElement>(".glass-intro");
  const page = shell?.querySelector<HTMLElement>(".page");
  if (
    !mount ||
    !canvas ||
    !shell ||
    !page ||
    mount.hasAttribute("data-mounted")
  )
    return;
  mountGlassSky(mount, canvas, shell, page);
}

function mountGlassSky(
  mount: HTMLElement,
  canvas: HTMLCanvasElement,
  shell: HTMLElement,
  page: HTMLElement,
) {
  const root = document.documentElement;
  const renderer = createGlassRenderer(canvas);
  if (!renderer) {
    delete root.dataset.glassIntro;
    return;
  }

  mount.dataset.mounted = "";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motion.matches;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const content = page.querySelectorAll<HTMLElement>("header, main > section");
  const skip = page.querySelector<HTMLAnchorElement>(".skip-intro");
  let disposed = false;
  let frameId = 0;
  let dirty = true;
  let last = 0;
  let elapsed = 0;
  let skySpeed = 1;
  let distance = 1;
  let columns = 6;
  let rows = 4;
  let start = { left: 0, top: 0, width: 1, height: 1 };
  let progress = 0;
  let morph = 0;
  let fixedOrigin = 0;
  let visible = true;
  let targetX = 0;
  let targetY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let rendered = false;
  let revealed = -1;

  function reveal(value: number) {
    if (value === revealed) return;
    revealed = value;
    shell.style.setProperty("--content-reveal", String(value));
    shell.style.setProperty(
      "--content-visibility",
      value > 0 ? "visible" : "hidden",
    );
    const inert = value < 0.1;
    for (const element of content) {
      if (element.inert !== inert) element.inert = inert;
    }
  }

  function measure() {
    if (disposed) return;
    const bounds = shell.getBoundingClientRect();
    // Fixed positioning starts inside the root's reserved scrollbar gutter.
    fixedOrigin = root.getBoundingClientRect().left;
    // The page's 100svh minimum resolves to pixels and stays stable as mobile
    // browser bars collapse. Unlike innerHeight, it won't shift the artwork or
    // scroll progress mid-gesture, but still updates on rotation/window resize.
    const height = Number.parseFloat(getComputedStyle(page).minHeight);
    const padding = Math.max(32, Math.min(bounds.width, height) * 0.076);
    const width = Math.max(1, bounds.width - padding * 2);
    const availableHeight = Math.max(1, height - padding * 2.2);
    const aspect = width / availableHeight;
    rows = aspect < 0.72 ? 6 : aspect < 1.1 ? 5 : 4;
    columns = Math.max(2, Math.min(12, Math.round(rows * aspect)));
    const tile = Math.max(
      1,
      Math.floor(Math.min(width / columns, availableHeight / rows)),
    );
    start = {
      left: bounds.left + (bounds.width - columns * tile) / 2,
      top: (height - rows * tile) / 2,
      width: columns * tile,
      height: rows * tile,
    };
    distance = height;
    shell.style.setProperty("--intro-distance", `${distance}px`);
    invalidate();
  }

  function layout() {
    const intro = !reduced;
    const bounds = shell.getBoundingClientRect();
    progress = intro ? clamp(-bounds.top / distance) : 1;
    const amount = ease(progress / 0.86);
    morph = amount;
    const target = mount.getBoundingClientRect();
    const left = start.left + (target.left - start.left) * amount;
    const top = start.top + (target.top - start.top) * amount;
    const width = start.width + (target.width - start.width) * amount;
    const height = start.height + (target.height - start.height) * amount;
    // The shader uses a cover crop: max(width, height * skyAspect) is the
    // displayed width of the full sky. Compensate for its shrinkage in CSS
    // pixels, independently of devicePixelRatio and backing-buffer quantization.
    skySpeed =
      Math.max(start.width, start.height * skyAspect) /
      Math.max(width, height * skyAspect);
    canvas.style.transform = `translate3d(${left - fixedOrigin}px, ${top}px, 0)`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    // Bound GPU work on large/high-DPI screens. Quantize backing-buffer changes
    // so shrinking the artwork doesn't allocate a new buffer every scroll pixel.
    const scale = Math.min(
      devicePixelRatio || 1,
      1.5,
      Math.sqrt(1_200_000 / (width * height)),
    );
    const bufferWidth = Math.max(1, Math.round((width * scale) / 32) * 32);
    const bufferHeight = Math.max(1, Math.round((height * scale) / 32) * 32);
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
    visible = top + height > 0 && top < window.innerHeight;
    const contentReveal = intro ? ease((progress - 0.65) / (0.86 - 0.65)) : 1;
    reveal(contentReveal);
    // Keep emerging text outside the artwork until it reaches its final bounds.
    shell.style.setProperty(
      "--header-offset",
      `${Math.min(0, top - target.top) - (1 - contentReveal) * 8}px`,
    );
    shell.style.setProperty(
      "--content-offset",
      `${Math.max(0, top + height - target.bottom) + (1 - contentReveal) * 12}px`,
    );
    return width / height;
  }

  let aspect = 1;
  function frame(now: number) {
    frameId = 0;
    if (disposed || document.hidden) return;
    const needsLayout = dirty;
    if (dirty) {
      aspect = layout();
      dirty = false;
    }
    // Scroll geometry tracks every animation frame; the ambient sky runs at 30fps.
    if (visible && (needsLayout || (!reduced && now - last >= 1000 / 30))) {
      if (!reduced) {
        // Scale the clock's increments, not its accumulated value, so scrolling
        // and resizing change velocity without jumping the cloud position.
        elapsed += (Math.min(now - (last || now), 100) / 1000) * skySpeed;
        pointerX += (targetX - pointerX) * 0.06;
        pointerY += (targetY - pointerY) * 0.06;
      }
      last = now;
      renderer?.draw(
        columns,
        rows,
        morph,
        elapsed,
        reduced ? 0 : pointerX,
        reduced ? 0 : pointerY,
        aspect,
      );
      // This attribute changes canvas/background visibility only on the first draw.
      if (!rendered) {
        mount.dataset.rendered = "";
        rendered = true;
      }
    }
    if (visible && !reduced) frameId = requestAnimationFrame(frame);
  }

  function invalidate() {
    dirty = true;
    if (!frameId && !disposed && !document.hidden)
      frameId = requestAnimationFrame(frame);
  }

  function syncMotion() {
    reduced = motion.matches;
    const wasIntro = root.hasAttribute("data-glass-intro");
    const position = Math.max(0, -shell.getBoundingClientRect().top);
    root.toggleAttribute("data-glass-intro", !reduced);
    // Preserve the content's position when removing the pinned scroll section.
    if (reduced && wasIntro)
      window.scrollTo(0, Math.max(0, position - distance));
    measure();
  }

  window.addEventListener("scroll", invalidate, { ...options, passive: true });
  window.addEventListener("resize", measure, { ...options, passive: true });
  window.addEventListener(
    "pointermove",
    (event) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    },
    { ...options, passive: true },
  );
  window.addEventListener(
    "pointerout",
    (event) => {
      if (!event.relatedTarget) {
        targetX = 0;
        targetY = 0;
      }
    },
    options,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
      last = 0;
      invalidate();
    },
    options,
  );
  motion.addEventListener("change", syncMotion, options);
  skip?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      if (!reduced)
        window.scrollTo({
          top: window.scrollY + shell.getBoundingClientRect().top + distance,
          behavior: "instant",
        });
      reveal(1);
      page.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
      invalidate();
    },
    options,
  );

  const observer = new ResizeObserver(measure);
  observer.observe(page);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    observer.disconnect();
    controller.abort();
    renderer?.dispose();
    delete root.dataset.glassIntro;
    delete mount.dataset.rendered;
    delete mount.dataset.mounted;
    reveal(1);
  }

  canvas.addEventListener(
    "webglcontextlost",
    () => {
      const position = Math.max(
        0,
        -shell.getBoundingClientRect().top - distance,
      );
      dispose();
      window.scrollTo(0, position);
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
  window.addEventListener("pageshow", invalidate, options);
  if (import.meta.hot) import.meta.hot.dispose(dispose);

  syncMotion();
}
