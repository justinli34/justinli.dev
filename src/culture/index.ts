import { createField, inoculate, readNameLines } from "./field";
import {
  createCulture,
  type Lenses,
  MAX_LENSES,
  MAX_STROKES,
  MAX_ZONES,
  type Palette,
  type Pointer,
  type Zones,
} from "./sim";
import { createWindows } from "./windows";

// Mirrors the colour tokens in global.css.
function rgb(...colors: string[]) {
  return new Float32Array(
    colors.flatMap((color) =>
      [1, 3, 5].map(
        (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255,
      ),
    ),
  );
}

const palette: Palette = {
  // medium, medium edge, plate strain A, plate strain B, visitor strain, name ink
  bright: rgb("#efeadf", "#ddd5c4", "#9a8fd0", "#86a0d6", "#d8432a", "#261d4d"),
  dark: rgb("#0d0c13", "#050409", "#a99cff", "#7fb2ff", "#ff6a48", "#e9e3ff"),
};

const VISITOR_STRAIN = 1;
const BOOT_DURATION = 4200;
const STROKE_HOLD = 450;
const ILLUMINATION_KEY = "culture:illumination";

// How far each window's zone of inhibition reaches past its edge (CSS px):
// fully cleared for `margin`, then fading back to open medium over `feather`.
const WINDOW_ZONE = { margin: 4, feather: 14 };

function dayNumber(date: Date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

function plateLabel(date: Date) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const ordinal = Math.round((today - start) / 86_400_000);
  return `${date.getFullYear()}·${String(ordinal).padStart(3, "0")}`;
}

function pad(value: number, length = 2) {
  return String(Math.floor(value)).padStart(length, "0");
}

export function boot() {
  const root = document.querySelector<HTMLElement>("[data-plate]");
  if (!root || root.dataset.booted !== undefined) return;
  root.dataset.booted = "";

  const windows = createWindows(root);
  const html = document.documentElement;
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const today = new Date();
  const todaysSeed = Math.imul(dayNumber(today), 2654435761) >>> 0;
  let seed = todaysSeed;
  let generation = 0;
  let paused = false;

  const readout = (name: string) => [
    ...root.querySelectorAll<HTMLElement>(`[data-readout="${name}"]`),
  ];
  const write = (name: string, value: string) => {
    for (const element of readout(name)) {
      if (element.textContent !== value) element.textContent = value;
    }
  };

  // Illumination -------------------------------------------------------------

  function storedIllumination() {
    try {
      return localStorage.getItem(ILLUMINATION_KEY);
    } catch {
      return null;
    }
  }

  function isDark() {
    const setting = html.dataset.illumination;
    return setting === "dark" || (setting !== "bright" && darkQuery.matches);
  }

  function setIllumination(value: "auto" | "bright" | "dark") {
    if (value === "auto") delete html.dataset.illumination;
    else html.dataset.illumination = value;
    try {
      if (value === "auto") localStorage.removeItem(ILLUMINATION_KEY);
      else localStorage.setItem(ILLUMINATION_KEY, value);
    } catch {}
    syncIllumination();
  }

  function syncIllumination() {
    const setting = html.dataset.illumination ?? "auto";
    for (const input of root?.querySelectorAll<HTMLInputElement>(
      'input[name="illumination"]',
    ) ?? []) {
      input.checked = input.value === setting;
    }
  }

  const stored = storedIllumination();
  if (stored === "bright" || stored === "dark")
    html.dataset.illumination = stored;
  syncIllumination();
  darkQuery.addEventListener("change", syncIllumination);

  root.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "illumination") {
      setIllumination(input.value as "auto" | "bright" | "dark");
    }
  });

  // Readouts that don't need the culture ------------------------------------

  const clock = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bootedAt = performance.now();
  function tick() {
    const seconds = (performance.now() - bootedAt) / 1000;
    write("clock", clock.format(new Date()));
    write(
      "elapsed",
      `${pad(seconds / 3600)}:${pad((seconds / 60) % 60)}:${pad(seconds % 60)}`,
    );
  }
  write("plate", plateLabel(today));
  write("growth", "Growing");
  tick();
  window.setInterval(tick, 1000);

  // Culture ------------------------------------------------------------------

  const canvas = root.querySelector<HTMLCanvasElement>("[data-culture]");
  if (!canvas) return;
  const viewArea = innerWidth * innerHeight;
  const cell = viewArea > 2_400_000 ? 2 : innerWidth < 720 ? 1.2 : 1.6;
  const culture = createCulture(canvas, cell);
  if (!culture) {
    root.dataset.culture = "unavailable";
    return;
  }

  const zones: Zones = {
    count: 0,
    boxes: new Float32Array(MAX_ZONES * 4),
    shapes: new Float32Array(MAX_ZONES * 4),
  };
  const pointer: Pointer = {
    feeder: { x: 0, y: 0, radius: 0 },
    strokes: new Float32Array(MAX_STROKES * 4),
    strokeCount: 0,
    strokeRadius: 12,
  };
  const segments: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    at: number;
  }[] = [];
  const lenses: Lenses = {
    count: 0,
    beads: new Float32Array(MAX_LENSES * 4),
    ink: new Float32Array(MAX_LENSES),
  };
  const discs = [...root.querySelectorAll<HTMLElement>(".disc")].slice(
    0,
    MAX_LENSES,
  );
  const hovered = new Set<HTMLElement>();
  let viewWidth = 1;
  let viewHeight = 1;
  let started = 0;
  let ready = false;
  // Set whenever the canvas is resized, which clears it.
  let stale = true;

  // The discs are drawn by the shader as glass beads; the DOM supplies
  // where they are and carries their labels.
  function measureLenses() {
    lenses.count = discs.length;
    discs.forEach((disc, index) => {
      const rect = disc.getBoundingClientRect();
      lenses.beads[index * 4] = rect.left + rect.width / 2;
      lenses.beads[index * 4 + 1] = rect.top + rect.height / 2;
      // Layout size, so a hover scale doesn't feed back into the radius.
      lenses.beads[index * 4 + 2] = disc.offsetWidth / 2;
    });
  }

  function approach(
    values: Float32Array,
    at: number,
    target: number,
    step: number,
  ) {
    const value = values[at] ?? 0;
    const done = Math.abs(target - value) < 0.002;
    values[at] = done ? target : value + (target - value) * step;
    return !done;
  }

  /** Eases each lens toward its hover and ink state; true while any moves. */
  function writeLenses(step: number) {
    let moving = false;
    discs.forEach((disc, index) => {
      const hover = hovered.has(disc) ? 1 : 0;
      const ink = disc.hasAttribute("data-active") ? 1 : 0;
      moving = approach(lenses.beads, index * 4 + 3, hover, step) || moving;
      moving = approach(lenses.ink, index, ink, step) || moving;
    });
    return moving;
  }

  for (const disc of discs) {
    const on = () => hovered.add(disc);
    const off = () => hovered.delete(disc);
    disc.addEventListener("pointerenter", on);
    disc.addEventListener("pointerleave", off);
    disc.addEventListener("focus", () => {
      if (disc.matches(":focus-visible")) on();
    });
    disc.addEventListener("blur", off);
  }

  function writeZones(now: number) {
    const open = windows.zones(now).slice(0, MAX_ZONES);
    zones.count = open.length;
    open.forEach((zone, index) => {
      const offset = index * 4;
      zones.boxes[offset] = zone.x + zone.width / 2;
      zones.boxes[offset + 1] = zone.y + zone.height / 2;
      zones.boxes[offset + 2] = zone.width / 2;
      zones.boxes[offset + 3] = zone.height / 2;
      zones.shapes[offset] = zone.radius;
      zones.shapes[offset + 1] = WINDOW_ZONE.margin;
      zones.shapes[offset + 2] = WINDOW_ZONE.feather;
      zones.shapes[offset + 3] = 1;
    });
  }

  function gridFor(width: number, height: number) {
    return {
      width: Math.ceil(width / cell),
      height: Math.ceil(height / cell),
      cell,
    };
  }

  function size() {
    viewWidth = Math.max(1, root?.clientWidth ?? innerWidth);
    viewHeight = Math.max(1, root?.clientHeight ?? innerHeight);
    // Colony edges are soft, so big screens can render below device resolution.
    const area = viewWidth * viewHeight;
    const ratio = Math.min(
      devicePixelRatio || 1,
      area > 1_600_000 ? 1.25 : area > 600_000 ? 1.5 : 2,
    );
    if (!canvas) return;
    canvas.width = Math.round(viewWidth * ratio);
    canvas.height = Math.round(viewHeight * ratio);
    stale = true;
  }

  function reseed(nextSeed: number) {
    seed = nextSeed;
    const grid = gridFor(viewWidth, viewHeight);
    const field = createField(grid, seed, readNameLines(root as HTMLElement));
    culture?.resize(grid.width, grid.height);
    culture?.load(inoculate(grid, seed, field), field);
    started = performance.now();
    generation += 1;
    write("seed", seed.toString(16).padStart(8, "0").toUpperCase());
    write("generation", pad(generation));
    write("grid", `${grid.width}×${grid.height}`);
    write(
      "precision",
      culture?.precision === "32f" ? "32-bit float" : "16-bit float",
    );
  }

  function resize() {
    size();
    const grid = gridFor(viewWidth, viewHeight);
    culture?.resize(grid.width, grid.height);
    culture?.setField(
      createField(grid, seed, readNameLines(root as HTMLElement)),
    );
    write("grid", `${grid.width}×${grid.height}`);
    measureLenses();
  }

  // Pointer: hovering feeds the medium, dragging inoculates the visitor strain.
  let pressing = false;
  let lastX = 0;
  let lastY = 0;
  function addSegment(x: number, y: number) {
    segments.push({
      x0: lastX,
      y0: lastY,
      x1: x,
      y1: y,
      at: performance.now(),
    });
    if (segments.length > MAX_STROKES) segments.shift();
    lastX = x;
    lastY = y;
  }
  function writeStrokes(now: number) {
    while (segments.length && now - (segments[0]?.at ?? now) > STROKE_HOLD) {
      segments.shift();
    }
    // Keep the pointer's resting point inoculated while the button is held.
    if (pressing && !segments.length) addSegment(lastX, lastY);
    pointer.strokeCount = segments.length;
    segments.forEach((segment, index) => {
      pointer.strokes.set(
        [segment.x0, segment.y0, segment.x1, segment.y1],
        index * 4,
      );
    });
  }
  root.addEventListener("pointermove", (event) => {
    const overSurface = event.target === canvas;
    if (pressing) addSegment(event.clientX, event.clientY);
    const feeding = !pressing && overSurface && event.pointerType === "mouse";
    pointer.feeder = {
      x: event.clientX,
      y: event.clientY,
      radius: feeding ? 56 : 0,
    };
  });
  root.addEventListener("pointerdown", (event) => {
    if (event.target !== canvas || event.button !== 0) return;
    pressing = true;
    lastX = event.clientX;
    lastY = event.clientY;
    pointer.strokeRadius = event.pointerType === "touch" ? 15 : 12;
    pointer.feeder.radius = 0;
    addSegment(lastX, lastY);
    canvas.setPointerCapture(event.pointerId);
  });
  const release = () => {
    pressing = false;
  };
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
  root.addEventListener("pointerleave", () => {
    pointer.feeder.radius = 0;
  });

  // Incubator controls.
  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const growth = target.closest<HTMLElement>("[data-growth-toggle]");
    if (growth) {
      paused = !paused;
      growth.setAttribute("aria-pressed", String(paused));
      growth.textContent = paused ? "Resume growth" : "Pause growth";
      write("growth", paused ? "Paused" : "Growing");
    }
    if (target.closest("[data-reinoculate]")) {
      reseed((Math.random() * 2 ** 32) >>> 0);
    }
    if (target.closest("[data-restore]")) reseed(todaysSeed);
  });

  // Frame loop ---------------------------------------------------------------

  let dark = isDark() ? 1 : 0;
  let last = performance.now();
  let lastProbe = 0;
  let budget = 1;
  let frameTime = 16;
  let frame = 0;
  let previousZones = "";
  let lastLamp = "";

  function loop(now: number) {
    frame = requestAnimationFrame(loop);
    if (!ready) return;
    const delta = Math.min(100, now - last);
    last = now;
    frameTime += (delta - frameTime) * 0.05;
    if (frameTime > 22) budget = Math.max(0.35, budget * 0.97);
    else if (frameTime < 18) budget = Math.min(1, budget + 0.01);

    writeZones(now);
    writeStrokes(now);
    const reduced = motionQuery.matches;
    const age = now - started;
    let steps: number;
    if (paused) steps = 0;
    else if (reduced) {
      const signature = `${zones.count}:${zones.boxes.slice(0, zones.count * 4).join()}`;
      const changed = signature !== previousZones;
      previousZones = signature;
      steps = age < 1200 ? 60 : changed || pointer.strokeCount ? 24 : 0;
    } else {
      const base = age < BOOT_DURATION ? 26 : 12;
      steps = Math.max(2, Math.round(base * budget));
    }

    culture?.step(steps, zones, pointer, {
      strain: VISITOR_STRAIN,
      // The name grows in slowly from its inoculum; once it has, spores wake
      // up and it heals faster wherever a window has cleared it.
      spores: reduced || age > BOOT_DURATION * 0.6 ? 1 : 0,
      nameRate: reduced ? 1 : age > BOOT_DURATION ? 0.3 : 0.07,
    });

    const target = isDark() ? 1 : 0;
    const settling = Math.abs(target - dark) > 0.002;
    dark = settling
      ? dark + (target - dark) * (reduced ? 1 : Math.min(1, delta / 90))
      : target;
    const reveal = reduced ? (age < 1200 ? 0 : 1) : Math.min(1, age / 900);
    const { feeder } = pointer;
    const lamp = `${feeder.x},${feeder.y},${feeder.radius}`;
    const lensesMoving = writeLenses(reduced ? 1 : Math.min(1, delta / 110));
    // A paused or motionless plate only redraws when something changes.
    if (
      steps ||
      settling ||
      lensesMoving ||
      reveal < 1 ||
      lamp !== lastLamp ||
      stale
    ) {
      culture?.draw({
        viewWidth,
        viewHeight,
        dark,
        reveal,
        feeder,
        lenses,
        palette,
      });
      lastLamp = lamp;
      stale = false;
    }
    write("steps", String(steps));

    if (now - lastProbe > 1000) {
      lastProbe = now;
      const coverage = culture?.coverage() ?? 0;
      write("coverage", `${(coverage * 100).toFixed(1)}%`);
    }
  }

  function start() {
    size();
    measureLenses();
    reseed(seed);
    ready = true;
    root?.setAttribute("data-culture", "live");
  }

  const nameFont = root.querySelector<HTMLElement>("[data-name-line]");
  const fontReady = nameFont
    ? document.fonts.load(
        `${getComputedStyle(nameFont).fontWeight} 100px ${getComputedStyle(nameFont).fontFamily}`,
      )
    : Promise.resolve();
  Promise.race([
    fontReady.then(() => document.fonts.ready),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]).then(start, start);

  let resizeTimer = 0;
  new ResizeObserver(() => {
    if (!ready) return;
    window.clearTimeout(resizeTimer);
    size();
    resizeTimer = window.setTimeout(resize, 120);
  }).observe(root);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    root.dataset.culture = "unavailable";
  });

  frame = requestAnimationFrame(loop);
}
