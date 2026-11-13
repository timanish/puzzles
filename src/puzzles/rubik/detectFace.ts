// Finds one cube face anywhere in a camera frame, at any in-plane angle.
//
// Many cubes have no dark gaps between pieces, so neighboring pieces of one color look like
// a single patch. The detector therefore does not count stickers. It looks for the outline
// of the whole face, splits that outline into a 3x3 grid and checks the result against the picture.
//
// Outlines come from two sources:
//   1. Areas that are closed off from the background by edges. A face held up to the camera
//      is usually one such area, and its four corners give the outline directly.
//   2. Single flat patches of color. Each one covers some block of grid cells, which suggests
//      where the rest of the face must be. This still works when a hand touches the cube.

import type { RGB } from '../../shared/color';

export interface Frame {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

type Point = [number, number];
/** Corners in the order top left, top right, bottom right, bottom left. */
type Quad = [Point, Point, Point, Point];

export interface FaceDetection {
  /** Nine colors in reading order as the camera sees the face. The rotation is arbitrary. */
  colors: RGB[];
  /** Outline of the face in frame pixels: top left, top right, bottom right, bottom left. */
  corners: Quad;
  /** Quality from 0 to 12: how many of the outer cell edges lie on an edge in the picture. */
  matched: number;
}

const EDGE_THRESHOLD = 18;
/** Two colors count as different when their channels differ by this much in total. */
const CONTRAST = 45;

/** Marks pixels that differ clearly from their right or lower neighbor. */
function findEdges({ data, width, height }: Frame): Uint8Array {
  const edge = new Uint8Array(width * height);
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const r = i + 4;
      const d = i + width * 4;
      const diff = Math.max(
        Math.abs(data[i] - data[r]),
        Math.abs(data[i + 1] - data[r + 1]),
        Math.abs(data[i + 2] - data[r + 2]),
        Math.abs(data[i] - data[d]),
        Math.abs(data[i + 1] - data[d + 1]),
        Math.abs(data[i + 2] - data[d + 2]),
      );
      if (diff > EDGE_THRESHOLD) edge[y * width + x] = 1;
    }
  }
  return edge;
}

interface Region {
  area: number;
  /** Pixels on the rim of the region, as x and y pairs. */
  rim: number[];
  touchesBorder: boolean;
}

/** Groups the pixels where blocked is 0 into connected regions. */
function findRegions(blocked: Uint8Array, width: number, height: number, minArea: number): Region[] {
  const size = width * height;
  const seen = new Uint8Array(size);
  const stack = new Int32Array(size);
  const regions: Region[] = [];
  for (let start = 0; start < size; start++) {
    if (seen[start] || blocked[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let touchesBorder = false;
    const rim: number[] = [];
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
        rim.push(x, y);
        if (x > 0 && !seen[p - 1] && !blocked[p - 1]) seen[(stack[top++] = p - 1)] = 1;
        if (x < width - 1 && !seen[p + 1] && !blocked[p + 1]) seen[(stack[top++] = p + 1)] = 1;
        if (y > 0 && !seen[p - width] && !blocked[p - width]) seen[(stack[top++] = p - width)] = 1;
        if (y < height - 1 && !seen[p + width] && !blocked[p + width]) seen[(stack[top++] = p + width)] = 1;
        continue;
      }
      if (blocked[p - 1] || blocked[p + 1] || blocked[p - width] || blocked[p + width]) rim.push(x, y);
      if (!seen[p - 1] && !blocked[p - 1]) seen[(stack[top++] = p - 1)] = 1;
      if (!seen[p + 1] && !blocked[p + 1]) seen[(stack[top++] = p + 1)] = 1;
      if (!seen[p - width] && !blocked[p - width]) seen[(stack[top++] = p - width)] = 1;
      if (!seen[p + width] && !blocked[p + width]) seen[(stack[top++] = p + width)] = 1;
    }
    if (area >= minArea) regions.push({ area, rim, touchesBorder });
  }
  return regions;
}

/**
 * Marks everything that is closed off from the picture's border by edges.
 * The returned array holds 0 for such enclosed pixels and 1 for background.
 */
function findBackground(edge: Uint8Array, width: number, height: number): Uint8Array {
  // Thicken the edges by one pixel so that small breaks in an outline do not leak.
  const wall = new Uint8Array(edge.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (edge[p] || edge[p - 1] || edge[p + 1] || edge[p - width] || edge[p + width]) wall[p] = 1;
    }
  }
  const background = new Uint8Array(edge.length);
  const stack = new Int32Array(edge.length);
  let top = 0;
  const visit = (p: number) => {
    if (!background[p] && !wall[p]) {
      background[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < edge.length - width) visit(p + width);
  }
  return background;
}

interface Box {
  angle: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

/** Smallest rotated rectangle around a region. Coordinates u and v are x and y turned by the angle. */
function boundingBox(rim: number[]): Box {
  const measure = (degrees: number): Box & { size: number } => {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < rim.length; i += 2) {
      const u = rim[i] * cos + rim[i + 1] * sin;
      const v = -rim[i] * sin + rim[i + 1] * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    return { angle, minU, maxU, minV, maxV, size: (maxU - minU) * (maxV - minV) };
  };
  let best = measure(0);
  for (let d = 4; d < 90; d += 4) {
    const box = measure(d);
    if (box.size < best.size) best = box;
  }
  const coarse = (best.angle * 180) / Math.PI;
  for (let d = Math.max(0, coarse - 3); d <= Math.min(89, coarse + 3); d++) {
    const box = measure(d);
    if (box.size < best.size) best = box;
  }
  return best;
}

/** The four rim pixels that reach furthest into the corners of the bounding box. */
function cornersOf(rim: number[], angle: number): Quad {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const best = [-Infinity, -Infinity, -Infinity, -Infinity];
  const quad: Quad = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  for (let i = 0; i < rim.length; i += 2) {
    const u = rim[i] * cos + rim[i + 1] * sin;
    const v = -rim[i] * sin + rim[i + 1] * cos;
    const scores = [-u - v, u - v, u + v, -u + v];
    for (let k = 0; k < 4; k++) {
      if (scores[k] > best[k]) {
        best[k] = scores[k];
        quad[k] = [rim[i], rim[i + 1]];
      }
    }
  }
  return quad;
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function quadArea(q: Quad): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const [x1, y1] = q[k];
    const [x2, y2] = q[(k + 1) % 4];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Point inside a quad. S runs from the left side to the right side, t from top to bottom. */
function inQuad(q: Quad, s: number, t: number): Point {
  const topX = q[0][0] + (q[1][0] - q[0][0]) * s;
  const topY = q[0][1] + (q[1][1] - q[0][1]) * s;
  const bottomX = q[3][0] + (q[2][0] - q[3][0]) * s;
  const bottomY = q[3][1] + (q[2][1] - q[3][1]) * s;
  return [topX + (bottomX - topX) * t, topY + (bottomY - topY) * t];
}

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];
const gap = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Median color around a point, or null when the area is not one flat color. */
function samplePatch({ data, width, height }: Frame, cx: number, cy: number, radius: number): RGB | null {
  const channels: number[][] = [[], [], []];
  for (let y = Math.round(cy - radius); y <= cy + radius; y++) {
    for (let x = Math.round(cx - radius); x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const i = (y * width + x) * 4;
      channels[0].push(data[i]);
      channels[1].push(data[i + 1]);
      channels[2].push(data[i + 2]);
    }
  }
  const color: RGB = [median([...channels[0]]), median([...channels[1]]), median([...channels[2]])];
  let close = 0;
  const count = channels[0].length;
  for (let k = 0; k < count; k++) {
    if (gap([channels[0][k], channels[1][k], channels[2][k]], color) < 60) close++;
  }
  return close / count >= 0.7 ? color : null;
}

/** Largest difference from a color among the pixels around a point. */
function maxGap({ data, width, height }: Frame, cx: number, cy: number, radius: number, color: RGB): number {
  let worst = 0;
  for (let y = Math.round(cy - radius); y <= cy + radius; y++) {
    for (let x = Math.round(cx - radius); x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      worst = Math.max(worst, gap([data[i], data[i + 1], data[i + 2]], color));
    }
  }
  return worst;
}

interface Checked {
  quad: Quad;
  colors: RGB[];
  cell: number;
  support: number;
}

/** Tests a proposed outline against the picture. Returns null when it cannot be a face. */
function check(frame: Frame, edge: Uint8Array, quad: Quad): Checked | null {
  const sides = [distance(quad[0], quad[1]), distance(quad[1], quad[2]), distance(quad[2], quad[3]), distance(quad[3], quad[0])];
  const longest = Math.max(...sides);
  const shortest = Math.min(...sides);
  const cell = (sides[0] + sides[1] + sides[2] + sides[3]) / 12;
  // A face seen at a steep angle is too distorted to read reliably.
  if (cell < frame.height / 16 || longest > shortest * 1.45) return null;

  // Every cell must show one flat color.
  const colors: RGB[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const [x, y] = inQuad(quad, (col + 0.5) / 3, (row + 0.5) / 3);
      const color = samplePatch(frame, x, y, Math.max(2, cell * 0.2));
      if (!color) return null;
      colors.push(color);
    }
  }

  // The face must end where the outline says: each outer cell side has to lie on an edge
  // in the picture. A gradual change, such as shading on a wall, does not count.
  const reach = Math.max(2, Math.round(cell * 0.14));
  const onEdge = (s: number, t: number, inwardS: number, inwardT: number) => {
    const [x, y] = inQuad(quad, s, t);
    const [ix, iy] = inQuad(quad, s + inwardS * 0.1, t + inwardT * 0.1);
    const length = Math.hypot(ix - x, iy - y) || 1;
    for (let k = -reach; k <= reach; k++) {
      const px = Math.round(x + ((ix - x) / length) * k);
      const py = Math.round(y + ((iy - y) / length) * k);
      if (px >= 0 && py >= 0 && px < frame.width && py < frame.height && edge[py * frame.width + px]) return true;
    }
    return false;
  };
  let support = 0;
  for (let k = 0; k < 3; k++) {
    for (let side = 0; side < 4; side++) {
      let hits = 0;
      const samples = 7;
      for (let n = 0; n < samples; n++) {
        // Stay away from the cell corners, which are rounded on most cubes.
        const along = (k + 0.2 + (0.6 * n) / (samples - 1)) / 3;
        if (side === 0 && onEdge(along, 0, 0, 1)) hits++;
        if (side === 1 && onEdge(along, 1, 0, -1)) hits++;
        if (side === 2 && onEdge(0, along, 1, 0)) hits++;
        if (side === 3 && onEdge(1, along, -1, 0)) hits++;
      }
      if (hits >= 5) support++;
    }
  }
  if (support < 10) return null;

  // A single large piece can pass the tests above when all nine cells are placed inside it.
  // A real face has seams. Where four cells of one color meet, the small dark gap between
  // the rounded piece corners has to be visible.
  let seams = 0;
  for (let i = 1; i <= 2; i++) {
    for (let j = 1; j <= 2; j++) {
      const around = [colors[(j - 1) * 3 + i - 1], colors[(j - 1) * 3 + i], colors[j * 3 + i - 1], colors[j * 3 + i]];
      const mixed = around.some((color) => gap(color, around[0]) > CONTRAST);
      const [x, y] = inQuad(quad, i / 3, j / 3);
      if (mixed || maxGap(frame, x, y, Math.max(1.5, cell * 0.12), around[0]) > 28) seams++;
    }
  }
  if (seams < 3) return null;

  return { quad, colors, cell, support };
}

/** Turns the corner order so that the first side points mostly to the right of the picture. */
function upright(quad: Quad): Quad {
  let best = 0;
  let bestScore = -Infinity;
  for (let k = 0; k < 4; k++) {
    const a = quad[k];
    const b = quad[(k + 1) % 4];
    const score = (b[0] - a[0]) / (distance(a, b) || 1);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return [quad[best], quad[(best + 1) % 4], quad[(best + 2) % 4], quad[(best + 3) % 4]];
}

export function detectFace(frame: Frame): FaceDetection | null {
  const { width, height } = frame;
  const edge = findEdges(frame);
  const minCell = height / 16;
  let best: Checked | null = null;
  const consider = (quad: Quad) => {
    const found = check(frame, edge, upright(quad));
    if (!found) return;
    // The outline that sits best on the picture's edges wins. Between equals the larger one wins,
    // because a smaller one is usually a part of the real face.
    if (!best || found.support > best.support || (found.support === best.support && found.cell > best.cell)) {
      best = found;
    }
  };

  // Source 1: areas closed off from the background.
  const background = findBackground(edge, width, height);
  for (const region of findRegions(background, width, height, (minCell * 3) ** 2)) {
    if (region.touchesBorder) continue;
    const quad = cornersOf(region.rim, boundingBox(region.rim).angle);
    // The area must fill its outline. A cube with a hand attached does not.
    if (region.area / quadArea(quad) < 0.85) continue;
    consider(quad);
  }

  // Source 2: single flat patches, each read as a block of grid cells.
  if (!best) {
    const patches = findRegions(edge, width, height, Math.max(40, (minCell * 0.8) ** 2))
      .filter((r) => !r.touchesBorder)
      .sort((a, b) => b.area - a.area)
      .slice(0, 30);
    for (const patch of patches) {
      const box = boundingBox(patch.rim);
      // The edge pixels around a patch are not part of it, so the patch is a little smaller than the piece.
      const w = box.maxU - box.minU + 3;
      const h = box.maxV - box.minV + 3;
      if (patch.area / (w * h) < 0.5) continue;
      const long = Math.max(w, h);
      const short = Math.min(w, h);
      const ratio = long / short;

      // How many cells the patch may cover along its long and short side, and the cell size that implies.
      const guesses: [number, number, number][] = [];
      if (ratio < 1.3) {
        const side = (w + h) / 2;
        guesses.push([1, 1, side], [2, 2, side / 2], [3, 3, side / 3]);
      } else if (ratio < 1.75) {
        guesses.push([3, 2, (long / 3 + short / 2) / 2]);
      } else if (ratio < 2.5) {
        guesses.push([2, 1, (long / 2 + short) / 2]);
      } else if (ratio < 3.7) {
        guesses.push([3, 1, (long / 3 + short) / 2]);
      }

      const cos = Math.cos(box.angle);
      const sin = Math.sin(box.angle);
      const point = (u: number, v: number): Point => [u * cos - v * sin, u * sin + v * cos];
      for (const [alongLong, alongShort, cell] of guesses) {
        if (cell < minCell) continue;
        const cols = w >= h ? alongLong : alongShort;
        const rows = w >= h ? alongShort : alongLong;
        // The patch can sit anywhere inside the 3x3 grid.
        for (let i = 0; i <= 3 - cols; i++) {
          for (let j = 0; j <= 3 - rows; j++) {
            const u0 = box.minU - 1.5 - i * cell;
            const v0 = box.minV - 1.5 - j * cell;
            const size = cell * 3;
            consider([point(u0, v0), point(u0 + size, v0), point(u0 + size, v0 + size), point(u0, v0 + size)]);
          }
        }
      }
    }
  }

  const found = best as Checked | null;
  return found ? { colors: found.colors, corners: found.quad, matched: found.support } : null;
}
