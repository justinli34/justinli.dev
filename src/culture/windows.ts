// Window manager for the plate. Windows are specimens laid on the culture:
// each one clears a zone of inhibition that grows out from whatever opened it.
// Open windows are mirrored into history so links and the back button work.

export type Zone = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

type Specimen = {
  id: string;
  element: HTMLElement;
  x: number;
  y: number;
  origin: Zone | null;
  openedAt: number;
  opener: HTMLElement | null;
  closing: number;
};

type HistoryMode = "push" | "replace" | "none";

const GROW_DURATION = 720;
const CLOSE_DURATION = 220;
const EDGE = 20;
const TOP = 20;
const BOTTOM = 20;

const ease = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function zoneOf(element: Element): Zone {
  const zone = element.querySelector("[data-zone-shape]") ?? element;
  const rect = zone.getBoundingClientRect();
  const circle = zone.getAttribute("data-zone-shape") === "circle";
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    radius: circle ? rect.width / 2 : 6,
  };
}

export function createWindows(root: HTMLElement) {
  const layer = root.querySelector<HTMLElement>("[data-windows]");
  const compact = matchMedia("(max-width: 719px)");
  const stack: Specimen[] = [];
  const titleSuffix = "Justin Li";

  function find(id: string) {
    return (
      layer?.querySelector<HTMLElement>(`[data-window="${CSS.escape(id)}"]`) ??
      null
    );
  }

  function specimen(id: string) {
    return stack.find((entry) => entry.id === id);
  }

  async function resolve(id: string) {
    const existing = find(id);
    if (existing || !id.startsWith("post:") || !layer) return existing;
    try {
      const response = await fetch(urlFor(id));
      if (!response.ok) return null;
      const html = await response.text();
      const page = new DOMParser().parseFromString(html, "text/html");
      const fetched = page.querySelector<HTMLElement>(
        `[data-window="${CSS.escape(id)}"]`,
      );
      if (!fetched) return null;
      // Another open request may have won the race while this one was loading.
      const raced = find(id);
      if (raced) return raced;
      const element = document.importNode(fetched, true);
      delete element.dataset.open;
      layer.append(element);
      return element;
    } catch {
      return null;
    }
  }

  function urlFor(id: string | undefined) {
    if (!id) return "/";
    if (id.startsWith("post:")) {
      return `/blog/${encodeURIComponent(id.slice(5))}`;
    }
    if (id === "missing") return location.pathname;
    return `/#${id}`;
  }

  function openIds() {
    return stack.filter((entry) => !entry.closing).map((entry) => entry.id);
  }

  function commit(mode: HistoryMode) {
    const ids = openIds();
    const top = ids.at(-1);
    const topElement = top ? specimen(top)?.element : null;
    const title = topElement?.dataset.title;
    document.title = title ? `${title} — ${titleSuffix}` : titleSuffix;
    for (const disc of root.querySelectorAll<HTMLElement>(".disc[data-open]")) {
      disc.toggleAttribute(
        "data-active",
        ids.includes(disc.dataset.open ?? ""),
      );
    }
    if (mode === "none") return;
    const url = urlFor(top);
    const state = { windows: ids };
    if (mode === "push") history.pushState(state, "", url);
    else history.replaceState(state, "", url);
  }

  function apply(entry: Specimen) {
    if (compact.matches) {
      entry.element.style.removeProperty("translate");
    } else {
      entry.element.style.translate = `${Math.round(entry.x)}px ${Math.round(entry.y)}px`;
    }
    const coords = entry.element.querySelector("[data-coords]");
    if (coords) {
      const x = String(Math.max(0, Math.round(entry.x))).padStart(4, "0");
      const y = String(Math.max(0, Math.round(entry.y))).padStart(4, "0");
      coords.textContent = `${x}·${y}`;
    }
  }

  function clamp(entry: Specimen) {
    const width = entry.element.offsetWidth;
    const height = entry.element.offsetHeight;
    const maxX = Math.max(EDGE, innerWidth - EDGE - width);
    const maxY = Math.max(TOP, innerHeight - BOTTOM - height);
    entry.x = Math.min(maxX, Math.max(EDGE, entry.x));
    entry.y = Math.min(maxY, Math.max(TOP, entry.y));
  }

  /** The bounding box of the disc ring, which windows try not to cover. */
  function dock() {
    const discs = [...root.querySelectorAll(".disc")].map(zoneOf);
    if (!discs.length) return null;
    const left = Math.min(...discs.map((zone) => zone.x));
    const right = Math.max(...discs.map((zone) => zone.x + zone.width));
    return { left, right };
  }

  function place(entry: Specimen) {
    const width = entry.element.offsetWidth;
    const ring = dock();
    const parent = entry.opener?.closest<HTMLElement>("[data-window]");
    const parentEntry = parent
      ? stack.find((item) => item.element === parent)
      : null;
    if (parentEntry) {
      // Opened from inside another window: cascade off it like a new sheet.
      entry.x = parentEntry.x + 36;
      entry.y = parentEntry.y + 64;
    } else if (ring && ring.left - EDGE >= width + 24) {
      // Open in the open medium beside the ring, level with what opened it.
      entry.x = ring.left - 24 - width;
    } else if (ring && innerWidth - EDGE - ring.right >= width + 24) {
      entry.x = ring.right + 24;
    } else {
      entry.x = (innerWidth - width) / 2;
    }
    // Fresh windows open on a shelf near the top of the plate, above the
    // name, so where a window appears is predictable.
    if (!parentEntry) entry.y = TOP + 48;
    // Cascade instead of stacking exactly on top of another window.
    for (let tries = 0; tries < 8; tries++) {
      const overlapping = stack.some(
        (other) =>
          other !== entry &&
          !other.closing &&
          Math.abs(other.x - entry.x) < 16 &&
          Math.abs(other.y - entry.y) < 16,
      );
      if (!overlapping) break;
      entry.x += 28;
      entry.y += 28;
    }
    clamp(entry);
    apply(entry);
  }

  function raise(entry: Specimen) {
    const index = stack.indexOf(entry);
    if (index >= 0 && index !== stack.length - 1) {
      stack.splice(index, 1);
      stack.push(entry);
    }
    stack.forEach((item, order) => {
      item.element.style.zIndex = String(10 + order);
      item.element.toggleAttribute("data-top", order === stack.length - 1);
    });
  }

  async function open(
    id: string,
    options: {
      origin?: Zone | null;
      opener?: HTMLElement | null;
      history?: HistoryMode;
      focus?: boolean;
    } = {},
  ) {
    const {
      origin = null,
      opener = null,
      history = "push",
      focus = true,
    } = options;
    const existing = specimen(id);
    if (existing) {
      if (existing.closing) {
        window.clearTimeout(existing.closing);
        existing.closing = 0;
        existing.element.dataset.state = "open";
      }
      raise(existing);
      if (focus) existing.element.focus({ preventScroll: true });
      commit(history === "push" ? "replace" : history);
      return;
    }

    root.setAttribute("aria-busy", "true");
    const element = await resolve(id);
    root.removeAttribute("aria-busy");
    if (!element || specimen(id)) return;

    const entry: Specimen = {
      id,
      element,
      x: 0,
      y: 0,
      origin,
      openedAt: performance.now(),
      opener,
      closing: 0,
    };
    stack.push(entry);
    element.dataset.open = "";
    element.dataset.state = "entering";
    place(entry);
    if (!entry.origin) {
      const zone = zoneOf(element);
      entry.origin = {
        x: zone.x + zone.width / 2 - 24,
        y: zone.y + zone.height / 2 - 24,
        width: 48,
        height: 48,
        radius: 24,
      };
    }
    raise(entry);
    requestAnimationFrame(() => {
      if (!entry.closing) element.dataset.state = "open";
    });
    if (focus) element.focus({ preventScroll: true });
    commit(history);
  }

  function close(id: string, history: HistoryMode = "replace") {
    const entry = specimen(id);
    if (!entry || entry.closing) return;
    const wasFocused = entry.element.contains(document.activeElement);
    entry.element.dataset.state = "closing";
    entry.closing = window.setTimeout(() => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      delete entry.element.dataset.open;
      delete entry.element.dataset.state;
      entry.element.removeAttribute("data-top");
    }, CLOSE_DURATION);
    const next = stack.filter((item) => !item.closing).at(-1);
    if (next) raise(next);
    if (wasFocused) {
      const fallback = entry.opener?.isConnected ? entry.opener : next?.element;
      fallback?.focus({ preventScroll: true });
    }
    commit(history);
  }

  function idsFromLocation() {
    const post = location.pathname.match(/^\/blog\/([^/]+)\/?$/);
    if (post?.[1]) return [`post:${decodeURIComponent(post[1])}`];
    const hash = decodeURIComponent(location.hash.slice(1));
    return hash && find(hash) ? [hash] : [];
  }

  async function reconcile(ids: string[]) {
    for (const entry of [...stack]) {
      if (!ids.includes(entry.id)) close(entry.id, "none");
    }
    for (const id of ids) {
      await open(id, { history: "none", focus: false });
    }
    commit("none");
  }

  /** The zones every open window is currently clearing, in viewport space. */
  function zones(now: number) {
    const result: Zone[] = [];
    // Sheets cover the plate on small screens; let it live on underneath.
    if (compact.matches) return result;
    for (const entry of stack) {
      if (entry.closing) continue;
      const target = zoneOf(entry.element);
      const t = ease(Math.min(1, (now - entry.openedAt) / GROW_DURATION));
      const origin = entry.origin;
      if (!origin || t >= 1) {
        result.push(target);
        continue;
      }
      const cx = lerp(
        origin.x + origin.width / 2,
        target.x + target.width / 2,
        t,
      );
      const cy = lerp(
        origin.y + origin.height / 2,
        target.y + target.height / 2,
        t,
      );
      const width = lerp(origin.width, target.width, t);
      const height = lerp(origin.height, target.height, t);
      result.push({
        x: cx - width / 2,
        y: cy - height / 2,
        width,
        height,
        radius: lerp(origin.radius, target.radius, t),
      });
    }
    return result;
  }

  // Interaction ---------------------------------------------------------------

  root.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const target = event.target as Element;
    const closer = target.closest<HTMLElement>("[data-close]");
    const owner = closer?.closest<HTMLElement>("[data-window]");
    if (closer && owner?.dataset.window) {
      event.preventDefault();
      close(owner.dataset.window);
      return;
    }
    const opener = target.closest<HTMLElement>("[data-open]");
    if (opener?.dataset.open) {
      event.preventDefault();
      void open(opener.dataset.open, { opener, origin: zoneOf(opener) });
    }
  });

  root.addEventListener("pointerdown", (event) => {
    const target = event.target as Element;
    const element = target.closest<HTMLElement>("[data-window]");
    const entry = element
      ? stack.find((item) => item.element === element)
      : null;
    if (!entry) return;
    raise(entry);

    const handle = target.closest<HTMLElement>("[data-drag]");
    if (!handle || target.closest("a, button") || compact.matches) return;
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const fromX = entry.x;
    const fromY = entry.y;
    handle.setPointerCapture(event.pointerId);
    entry.element.dataset.dragging = "";

    const move = (moveEvent: PointerEvent) => {
      entry.x = fromX + moveEvent.clientX - startX;
      entry.y = fromY + moveEvent.clientY - startY;
      clamp(entry);
      apply(entry);
    };
    const end = () => {
      delete entry.element.dataset.dragging;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });

  root.addEventListener("focusin", (event) => {
    const element = (event.target as Element).closest<HTMLElement>(
      "[data-window]",
    );
    const entry = element
      ? stack.find((item) => item.element === element)
      : null;
    if (entry && !entry.closing) raise(entry);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const top = stack.filter((entry) => !entry.closing).at(-1);
    if (top) {
      event.preventDefault();
      close(top.id);
    }
  });

  window.addEventListener("popstate", (event) => {
    const state = event.state as { windows?: string[] } | null;
    void reconcile(state?.windows ?? idsFromLocation());
  });

  function relayout() {
    for (const entry of stack) {
      clamp(entry);
      apply(entry);
    }
  }
  window.addEventListener("resize", relayout);
  compact.addEventListener("change", relayout);

  // Windows the server rendered open (a post, a missing page) are adopted as
  // if they had just been opened, so their zones still grow in.
  const initial = [
    ...(layer?.querySelectorAll<HTMLElement>("[data-window][data-open]") ?? []),
  ]
    .map((element) => element.dataset.window)
    .filter((id): id is string => Boolean(id));
  for (const element of layer?.querySelectorAll<HTMLElement>(
    "[data-window][data-open]",
  ) ?? []) {
    delete element.dataset.open;
  }
  const hashed = idsFromLocation().filter((id) => !initial.includes(id));
  void reconcile([...initial, ...hashed]).then(() => commit("replace"));

  return { open, close, zones, count: () => openIds().length };
}
