import { useEffect, useRef, useState } from 'react';

/** Opens the camera, preferring the rear one on phones, and plays it into the returned video ref. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Front cameras are shown mirrored because that is what people expect from a selfie view.
  const [mirrored, setMirrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera here. Camera access needs HTTPS or localhost.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        setMirrored(stream.getVideoTracks()[0]?.getSettings().facingMode !== 'environment');
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access for this page and try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'The camera could not be started.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, error, ready, mirrored, setMirrored };
}
