import { useEffect, useRef, useState } from 'react';
import { rgbCss, type RGB } from '../../shared/color';
import { useCamera } from '../../shared/useCamera';
import { detectFace, type FaceDetection } from './detectFace';
import { FaceTracker, type Neighbors, type TrackedFace } from './faceTracker';

/** Width of the frame that is analyzed. Small frames are fast and still show the pieces clearly. */
const FRAME_WIDTH = 320;

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

interface Props {
  /** Receives six faces of nine colors in arbitrary order and rotation, plus notes on how the cube was turned. */
  onDone: (faces: RGB[][], neighbors: Neighbors[]) => void;
  onCancel: () => void;
}

export function ScanView({ onDone, onCancel }: Props) {
  const { videoRef, error, ready, mirrored, setMirrored } = useCamera();
  const [found, setFound] = useState<TrackedFace[]>([]);
  const [seeing, setSeeing] = useState(false);
  const [flash, setFlash] = useState(0);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const tracker = (trackerRef.current ??= new FaceTracker());

  useEffect(() => {
    if (!ready) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    // Draws the outline of the side in view, split into its 3x3 grid.
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
      const [tl, tr, br, bl] = detection.corners;
      const mix = (a: readonly number[], b: readonly number[], t: number) =>
        [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
      g.strokeStyle = accepted ? '#34d399' : '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k <= 3; k++) {
        g.moveTo(...mix(tl, tr, k / 3));
        g.lineTo(...mix(bl, br, k / 3));
        g.moveTo(...mix(tl, bl, k / 3));
        g.lineTo(...mix(tr, br, k / 3));
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

      const before = tracker.faces;
      const outcome = tracker.observe(detection, performance.now());
      drawOverlay(detection, outcome === 'known' || outcome === 'added');
      if (outcome === 'added') {
        if (tracker.faces.length === 1) lockExposure(video);
        setFlash((n) => n + 1);
      }
      if (tracker.faces !== before) setFound(tracker.faces);
    }, 90);
    return () => window.clearInterval(timer);
  }, [ready, videoRef, tracker]);

  // Move on by itself once all six sides are in.
  useEffect(() => {
    if (found.length < 6) return;
    const timer = window.setTimeout(() => onDone(found.map((f) => f.colors), tracker.neighbors), 700);
    return () => window.clearTimeout(timer);
  }, [found, onDone, tracker]);

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

  // Saves the current camera picture as a file, so that a failing scan can be studied later.
  const savePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const photo = document.createElement('canvas');
    photo.width = video.videoWidth;
    photo.height = video.videoHeight;
    photo.getContext('2d')?.drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.href = photo.toDataURL('image/png');
    link.download = `puzzle-scan-${Date.now()}.png`;
    link.click();
  };

  const remove = (index: number) => {
    tracker.remove(index);
    setFound(tracker.faces);
  };
  const startOver = () => {
    tracker.reset();
    setFound([]);
  };

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
          way up the cube is. Roll it from one side to the next without putting it down, so the app can follow how the
          sides connect. An outline appears around a side when it is seen, and the screen flashes when it is saved.
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
          <button type="button" className="btn" onClick={startOver} disabled={found.length === 0}>
            Start over
          </button>
          <button type="button" className="btn" onClick={() => setMirrored(!mirrored)}>
            Flip view
          </button>
          <button type="button" className="btn" onClick={savePhoto} disabled={!ready}>
            Save photo
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <p className="hint">
        Tap a saved side to remove it if it looks wrong. Hold the cube by its edges so your fingers do not cover the
        side facing the camera, and light it from the front. If a scan fails, Save photo keeps the
        camera picture so the problem can be looked at.
      </p>
    </div>
  );
}
