// Finds one cube face anywhere in a camera frame, at any in-plane angle.
// It looks for flat, square-ish blobs of color and then for nine of them on a 3x3 lattice.

import type { RGB } from '../../shared/color';

export interface Frame {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface FaceDetection {
  /** Nine colors in reading order as the camera sees the face. The rotation is arbitrary. */
  colors: RGB[];
  center: [number, number];
  /** Lattice steps between neighboring stickers. U points mostly right and v mostly down. */
  u: [number, number];
  v: [number, number];
  /** How many of the nine stickers were found as separate blobs. */
  matched: number;
}

export interface Blob {
  x: number;
  y: number;
  area: number;
}

const EDGE_THRESHOLD = 18;

function findBlobs({ data, width, height }: Frame): Blob[] {
  const size = width * height;
  // A pixel is an edge when it differs clearly from its right or lower neighbor.
  const edge = new Uint8Array(size);
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

  const minArea = Math.max(30, (height / 40) ** 2);
  const maxArea = (height / 3.2) ** 2;
  const seen = new Uint8Array(size);
  const stack = new Int32Array(size);
  const blobs: Blob[] = [];

  for (let start = 0; start < size; start++) {
    if (seen[start] || edge[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let border = false;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border = true;
      if (x > 0 && !seen[p - 1] && !edge[p - 1]) seen[(stack[top++] = p - 1)] = 1;
      if (x < width - 1 && !seen[p + 1] && !edge[p + 1]) seen[(stack[top++] = p + 1)] = 1;
      if (y > 0 && !seen[p - width] && !edge[p - width]) seen[(stack[top++] = p - width)] = 1;
      if (y < height - 1 && !seen[p + width] && !edge[p + width]) seen[(stack[top++] = p + width)] = 1;
    }
    if (border || n < minArea || n > maxArea) continue;

    // Shape test from second moments. It does not depend on how the square is rotated.
    const mx = sx / n;
    const my = sy / n;
    const vxx = sxx / n - mx * mx;
    const vyy = syy / n - my * my;
    const vxy = sxy / n - mx * my;
    const mean = (vxx + vyy) / 2;
    const spread = Math.sqrt(((vxx - vyy) / 2) ** 2 + vxy * vxy);
    const major = mean + spread;
    const minor = mean - spread;
    if (minor <= 0 || major / minor > 2.4) continue;
    // A filled square scores 1 here. Ragged or hollow shapes score lower.
    if (n / (12 * Math.sqrt(major * minor)) < 0.8) continue;
    blobs.push({ x: mx, y: my, area: n });
  }
  return blobs;
}

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];

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
    const off = Math.abs(channels[0][k] - color[0]) + Math.abs(channels[1][k] - color[1]) + Math.abs(channels[2][k] - color[2]);
    if (off < 60) close++;
  }
  return close / count >= 0.7 ? color : null;
}

export const detectFace = (frame: Frame): FaceDetection | null => analyzeFrame(frame).face;

/** Like detectFace, but also returns every sticker-like blob. The scan screen draws them as feedback. */
export function analyzeFrame(frame: Frame): { face: FaceDetection | null; blobs: Blob[] } {
  const blobs = findBlobs(frame);
  return { face: blobs.length < 7 ? null : findLattice(frame, blobs), blobs };
}

function findLattice(frame: Frame, blobs: Blob[]): FaceDetection | null {

  let best: { points: [number, number][]; matched: number; error: number; c: Blob; u: [number, number] } | null = null;

  for (const c of blobs) {
    const side = Math.sqrt(c.area);
    for (const n of blobs) {
      if (n === c || n.area < c.area * 0.5 || n.area > c.area * 2) continue;
      const u: [number, number] = [n.x - c.x, n.y - c.y];
      const pitch = Math.hypot(u[0], u[1]);
      if (pitch < side || pitch > side * 1.9) continue;
      const v: [number, number] = [-u[1], u[0]];
      const tolerance = pitch * 0.3;

      const points: [number, number][] = [];
      let matched = 0;
      let error = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const px = c.x + i * u[0] + j * v[0];
          const py = c.y + i * u[1] + j * v[1];
          let hit: Blob | null = null;
          let hitDistance = tolerance;
          for (const b of blobs) {
            if (b.area < c.area * 0.5 || b.area > c.area * 2) continue;
            const d = Math.hypot(b.x - px, b.y - py);
            if (d < hitDistance) {
              hit = b;
              hitDistance = d;
            }
          }
          if (hit) {
            matched++;
            error += hitDistance;
            points.push([hit.x, hit.y]);
          } else {
            points.push([px, py]);
          }
        }
      }
      if (matched < 7) continue;
      if (!best || matched > best.matched || (matched === best.matched && error < best.error)) {
        best = { points, matched, error, c, u };
      }
    }
  }
  if (!best) return null;

  // Turn the lattice so that u points right and v points down in the picture.
  let [ux, uy] = best.u;
  let turns = 0;
  while (!(ux > 0 && Math.abs(ux) >= Math.abs(uy))) {
    [ux, uy] = [-uy, ux];
    if (++turns > 3) break;
  }
  const u: [number, number] = [ux, uy];
  const v: [number, number] = [-uy, ux];
  // The points were laid out for the original u. Reorder them for the turned lattice.
  const at = (i: number, j: number): [number, number] => {
    const px = best!.c.x + i * u[0] + j * v[0];
    const py = best!.c.y + i * u[1] + j * v[1];
    let nearest = best!.points[0];
    let nearestDistance = Infinity;
    for (const p of best!.points) {
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < nearestDistance) {
        nearest = p;
        nearestDistance = d;
      }
    }
    return nearest;
  };

  const radius = Math.max(2, Math.hypot(ux, uy) * 0.2);
  const colors: RGB[] = [];
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const [px, py] = at(i, j);
      const color = samplePatch(frame, px, py, radius);
      if (!color) return null;
      colors.push(color);
    }
  }
  return { colors, center: [best.c.x, best.c.y], u, v, matched: best.matched };
}
