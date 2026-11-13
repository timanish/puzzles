import { useEffect, useRef, useState } from 'react';
import { rgbCss, rgbToLab, type RGB } from '../../shared/color';
import { useCamera } from '../../shared/useCamera';
import { colorCost } from './colors';
import { detectFace, type FaceDetection } from './detectFace';

/** Width of the frame that is analyzed. Small frames are fast and still show the stickers clearly. */
const FRAME_WIDTH = 320;
/** A face is accepted after it has been read the same way this many times in a row. */
const STEADY_FRAMES = 2;

interface FoundFace {
  colors: RGB[];
  labs: number[][];
  matched: number;
}

const rotate = <T,>(cells: T[]) => cells.map((_, i) => cells[(2 - (i % 3)) * 3 + Math.floor(i / 3)]);

/** Average color difference between two faces, taking the best of the four rotations. */
function faceDifference(a: number[][], b: number[][]): number {
  let best = Infinity;
  let turned = a;
  for (let k = 0; k < 4; k++) {
    const total = turned.reduce((sum, lab, i) => sum + colorCost(lab, b[i]), 0) / 9;
    best = Math.min(best, total);
    turned = rotate(turned);
  }
  return best;
}

// Stops the camera from re-tuning brightness and white balance between sides, where it is supported.
function lockExposure(video: HTMLVideoElement | null) {
  const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities() as Record<string, unknown>;
  const advanced: Record<string, string>[] = [];
  for (const key of ['exposureMode', 'whiteBalanceMode']) {
    if (Array.isArray(caps[key]) && (caps[key] as string[]).includes('manual')) advanced.push({ [key]: 'manual' });
  }
  if (advanced.length) track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
}

/**
 * Decides what a new sighting is: a side that is already known, a new side, or noise.
 * Returns the index of the matching side, -1 for a new side, or null to ignore it.
 */
function identify(found: FoundFace[], labs: number[][]): number | null {
  let nearest = -1;
  let nearestDifference = Infinity;
  let centerGap = Infinity;
  found.forEach((face, i) => {
    const d = faceDifference(labs, face.labs);
    if (d < nearestDifference) {
      nearestDifference = d;
      nearest = i;
    }
    centerGap = Math.min(centerGap, colorCost(labs[4], face.labs[4]));
  });
  if (nearestDifference < 14) return nearest;
  // A new side has a center color of its own. Red and orange centers can look alike,
  // so a clearly different sticker pattern also counts when the centers are only a little apart.
  if (centerGap > 16 || (centerGap > 7 && nearestDifference > 28)) return -1;
  return null;
}

interface Props {
  /** Receives six faces of nine colors. Their order and rotation are arbitrary. */
  onDone: (faces: RGB[][]) => void;
  onCancel: () => void;
}

export function ScanView({ onDone, onCancel }: Props) {
  const { videoRef, error, ready, mirrored, setMirrored } = useCamera();
  const [found, setFound] = useState<FoundFace[]>([]);
  const [seeing, setSeeing] = useState(false);
  const [flash, setFlash] = useState(0);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const foundRef = useRef(found);
  foundRef.current = found;

  useEffect(() => {
    if (!ready) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    let previous: number[][] | null = null;
    let steady = 0;

    const drawOverlay = (detection: FaceDetection | null, accepted: boolean) => {
      const overlay = overlayRef.current;
      const g = overlay?.getContext('2d');
      if (!overlay || !g) return;
      if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
        overlay.width = canvas.width;
        overlay.height = canvas.height;
      }
      g.clearRect(0, 0, overlay.width, overlay.height);
      if (!detection) return;
      const { center, u, v } = detection;
      const corner = (i: number, j: number) => [center[0] + i * u[0] + j * v[0], center[1] + i * u[1] + j * v[1]] as const;
      g.strokeStyle = accepted ? '#4cc38a' : '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      for (const k of [-1.5, -0.5, 0.5, 1.5]) {
        g.moveTo(...corner(k, -1.5));
        g.lineTo(...corner(k, 1.5));
        g.moveTo(...corner(-1.5, k));
        g.lineTo(...corner(1.5, k));
      }
      g.stroke();
    };

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      const height = Math.round((FRAME_WIDTH * video.videoHeight) / video.videoWidth);
      if (canvas.width !== FRAME_WIDTH || canvas.height !== height) {
        canvas.width = FRAME_WIDTH;
        canvas.height = height;
      }
      ctx.drawImage(video, 0, 0, FRAME_WIDTH, height);
      const detection = detectFace(ctx.getImageData(0, 0, FRAME_WIDTH, height));
      setSeeing(Boolean(detection));

      if (!detection) {
        previous = null;
        steady = 0;
        drawOverlay(null, false);
        return;
      }
      const labs = detection.colors.map(rgbToLab);
      // Two readings in a row must agree. This filters out motion blur.
      const agrees = previous !== null && labs.every((lab, i) => colorCost(lab, previous![i]) < 12);
      steady = agrees ? steady + 1 : 1;
      previous = labs;
      const known = foundRef.current;
      const match = steady >= STEADY_FRAMES ? identify(known, labs) : null;
      drawOverlay(detection, match !== null);
      if (match === null) return;

      const face: FoundFace = { colors: detection.colors, labs, matched: detection.matched };
      if (match === -1 && known.length < 6) {
        if (known.length === 0) lockExposure(video);
        foundRef.current = [...known, face];
        setFound(foundRef.current);
        setFlash((n) => n + 1);
      } else if (match >= 0 && face.matched > known[match].matched) {
        // A cleaner view of a known side replaces the earlier one.
        foundRef.current = known.map((f, i) => (i === match ? face : f));
        setFound(foundRef.current);
      }
    }, 90);
    return () => window.clearInterval(timer);
  }, [ready, videoRef]);

  // Move on by itself once all six sides are in.
  useEffect(() => {
    if (found.length < 6) return;
    const timer = window.setTimeout(() => onDone(found.map((f) => f.colors)), 700);
    return () => window.clearTimeout(timer);
  }, [found, onDone]);

  if (error) {
    return (
      <div className="card">
        <h2>Camera unavailable</h2>
        <p>{error}</p>
        <button type="button" className="btn" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  const remove = (index: number) => setFound(found.filter((_, i) => i !== index));

  return (
    <div className="scan">
      <div className={mirrored ? 'cam mirrored' : 'cam'}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={overlayRef} className="cam-overlay" />
        {flash > 0 && <div key={flash} className="cam-flash" />}
        {!ready && <div className="cam-wait">Starting camera…</div>}
      </div>

      <div className="card">
        <h2>{found.length < 6 ? `${found.length} of 6 sides found` : 'All six sides found'}</h2>
        <p>
          Turn the cube slowly so that every side faces the camera once. Any order works, and it does not matter which
          way up the cube is. A grid appears when a side is seen, and the screen flashes when it is saved.
        </p>
        <p className={seeing ? 'status good left' : 'status left'} role="status">
          {found.length === 6 ? 'Fitting the sides together…' : seeing ? 'Side in view.' : 'Looking for a side…'}
        </p>
        <div className="sides" aria-label="Sides found so far">
          {Array.from({ length: 6 }, (_, i) => {
            const face = found[i];
            return (
              <button
                type="button"
                key={i}
                className="side"
                disabled={!face}
                onClick={() => remove(i)}
                aria-label={face ? `Side ${i + 1}. Remove it to scan it again.` : `Side ${i + 1}, not found yet`}
              >
                {Array.from({ length: 9 }, (_, j) => (
                  <span key={j} style={face ? { background: rgbCss(face.colors[j]) } : undefined} />
                ))}
              </button>
            );
          })}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setFound([])} disabled={found.length === 0}>
            Start over
          </button>
          <button type="button" className="btn" onClick={() => setMirrored(!mirrored)}>
            Flip view
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <p className="hint">
        Tap a saved side to remove it if it looks wrong. Hold the cube by its edges so your fingers do not cover the
        side facing the camera, and light it from the front.
      </p>
    </div>
  );
}
