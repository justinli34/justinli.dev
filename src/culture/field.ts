// Everything about a plate that is decided before it starts growing: where the
// medium favours spots or mazes, where the name is cast, and where it is
// inoculated. All of it derives from a seed so a day always grows the same way.

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Which kind of growth the medium favours at a CSS position (0 spots, 1 coral). */
function morphology(x: number, y: number, seed: number) {
  const value =
    noise(x / 420, y / 420, seed) * 0.65 +
    noise(x / 160, y / 160, seed ^ 0x9e3779b9) * 0.35;
  return smoothstep(0.34, 0.78, value);
}

export type Grid = { width: number; height: number; cell: number };

export type NameLine = {
  text: string;
  x: number;
  baseline: number;
  size: number;
  font: string;
  letterSpacing: string;
};

export function readNameLines(root: HTMLElement): NameLine[] {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [];
  return [...root.querySelectorAll<HTMLElement>("[data-name-line]")].map(
    (line) => {
      const style = getComputedStyle(line);
      const rect = line.getBoundingClientRect();
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.font = font;
      const metrics = context.measureText(line.textContent ?? "");
      // The line box is shorter than the font's content area (tight
      // line-height), so centre the content area in it to find the baseline.
      const ascent = metrics.fontBoundingBoxAscent;
      const content = ascent + metrics.fontBoundingBoxDescent;
      return {
        text: line.textContent ?? "",
        x: rect.left,
        baseline: rect.top + (rect.height - content) / 2 + ascent,
        size: Number.parseFloat(style.fontSize),
        font,
        letterSpacing:
          style.letterSpacing === "normal" ? "0px" : style.letterSpacing,
      };
    },
  );
}

function rasterize(
  grid: Grid,
  lines: NameLine[],
  paint: (context: CanvasRenderingContext2D, line: NameLine) => void,
  blur = 0,
) {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray(grid.width * grid.height * 4);
  context.scale(1 / grid.cell, 1 / grid.cell);
  if (blur) context.filter = `blur(${blur}px)`;
  context.fillStyle = "#fff";
  context.strokeStyle = "#fff";
  context.lineJoin = "round";
  for (const line of lines) {
    context.font = line.font;
    context.letterSpacing = line.letterSpacing;
    paint(context, line);
  }
  return context.getImageData(0, 0, grid.width, grid.height).data;
}

export function createField(grid: Grid, seed: number, lines: NameLine[]) {
  // Colonies can't hold a hairline, so the stencil is swollen until its
  // thinnest strokes are a few cells wide, like growth spilling past a mask.
  const swell = (line: NameLine) => Math.max(grid.cell * 3, line.size * 0.045);
  const letters = rasterize(grid, lines, (context, line) => {
    context.lineWidth = swell(line);
    context.strokeText(line.text, line.x, line.baseline);
    context.fillText(line.text, line.x, line.baseline);
  });
  const moat = rasterize(
    grid,
    lines,
    (context, line) => {
      context.lineWidth = swell(line) + line.size * 0.11;
      context.strokeText(line.text, line.x, line.baseline);
      context.fillText(line.text, line.x, line.baseline);
    },
    3,
  );

  const field = new Uint8Array(grid.width * grid.height * 4);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const index = (y * grid.width + x) * 4;
      const cssX = (x + 0.5) * grid.cell;
      const cssY = (y + 0.5) * grid.cell;
      field[index] = letters[index + 3] ?? 0;
      field[index + 1] = moat[index + 3] ?? 0;
      field[index + 2] = Math.round(morphology(cssX, cssY, seed) * 255);
      field[index + 3] = 255;
    }
  }
  return field;
}

/** A fresh plate: clean medium with a scatter of inoculation sites. */
export function inoculate(grid: Grid, seed: number, field: Uint8Array) {
  const { width, height, cell } = grid;
  const state = new Float32Array(width * height * 4);
  for (let index = 0; index < state.length; index += 4) state[index] = 1;

  const next = random(seed);
  function drop(cx: number, cy: number, radius: number, strain: number) {
    const r = Math.ceil(radius);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const gx = Math.round(cx + x);
        const gy = Math.round(cy + y);
        if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
        if (x * x + y * y > radius * radius) continue;
        const index = (gy * width + gx) * 4;
        state[index] = 0.5;
        state[index + 1] = 0.25 + next() * 0.1;
        state[index + 2] = strain;
      }
    }
  }

  const area = width * height * cell * cell;
  const colonies = Math.round(10 + area / 70_000);
  for (
    let placed = 0, attempt = 0;
    placed < colonies && attempt < colonies * 20;
    attempt++
  ) {
    const x = next() * width;
    const y = next() * height;
    const strain = next() < 0.35 ? 0.5 : 0;
    // Keep the plate's own colonies out of the name and its moat.
    if ((field[(Math.floor(y) * width + Math.floor(x)) * 4 + 1] ?? 0) > 0)
      continue;
    drop(x, y, 2 + next() * 3, strain);
    placed++;
  }

  // Each separate piece of the name (a stem, the dot of an i) gets its own
  // inoculum so the whole name takes, spreading out from a few points.
  for (const piece of letterPieces(grid, field)) {
    const count = 2 + Math.floor(piece.length / 1800);
    for (let index = 0; index < count; index++) {
      const cellIndex = piece[Math.floor(next() * piece.length)] ?? 0;
      drop(cellIndex % width, Math.floor(cellIndex / width), 2.5, 0);
    }
  }

  return state;
}

/** Connected regions of the letterform mask, as lists of cell indices. */
function letterPieces({ width, height }: Grid, field: Uint8Array) {
  const seen = new Uint8Array(width * height);
  const pieces: number[][] = [];
  const inside = (index: number) => (field[index * 4] ?? 0) > 160;
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !inside(start)) continue;
    const piece: number[] = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const index = queue.pop() as number;
      piece.push(index);
      const x = index % width;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        index - width,
        index + width,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= width * height) continue;
        if (seen[neighbour] || !inside(neighbour)) continue;
        seen[neighbour] = 1;
        queue.push(neighbour);
      }
    }
    pieces.push(piece);
  }
  return pieces;
}
