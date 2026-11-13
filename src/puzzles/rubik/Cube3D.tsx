import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { FACES, FACE_NORMALS, STICKERS, type CubeState, type Face, type Move, type Vec3 } from './cube';

// The cube is drawn with CSS 3D transforms. The cube element is flipped vertically,
// so coordinates inside it follow the model: x right, y up, z toward the viewer.

const ORIENT: Record<Face, string> = {
  F: '',
  B: 'rotateY(180deg)',
  R: 'rotateY(90deg)',
  L: 'rotateY(-90deg)',
  U: 'rotateX(-90deg)',
  D: 'rotateX(90deg)',
};

const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

const inLayer = (pos: Vec3, n: Vec3) => pos[0] * n[0] + pos[1] * n[1] + pos[2] * n[2] === 1;

interface Props {
  state: CubeState;
  /** CSS colors for the faces in U, R, F, D, L, B order. */
  colors: string[];
  /** Move to animate, starting from state. A new object restarts the animation. */
  turn?: Move | null;
  onTurnEnd?: () => void;
  /** Edge length of one cubie in pixels. */
  cubie?: number;
}

export function Cube3D({ state, colors, turn = null, onTurnEnd, cubie = 52 }: Props) {
  const [view, setView] = useState({ x: -26, y: -36 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const onEnd = useRef(onTurnEnd);
  onEnd.current = onTurnEnd;

  useEffect(() => {
    const el = layerRef.current;
    if (!turn || !el) return;
    const [x, y, z] = FACE_NORMALS[turn.face];
    const angle = turn.turns === 1 ? -90 : turn.turns === 2 ? -180 : 90;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = el.animate(
      [{ transform: `rotate3d(${x}, ${y}, ${z}, 0deg)` }, { transform: `rotate3d(${x}, ${y}, ${z}, ${angle}deg)` }],
      { duration: reduced ? 1 : turn.turns === 2 ? 520 : 380, easing: 'ease-in-out', fill: 'forwards' },
    );
    animation.finished.then(() => onEnd.current?.()).catch(() => {});
    return () => animation.cancel();
  }, [turn]);

  const sticker = (index: number) => {
    const { pos, normal, face } = STICKERS[index];
    const at = pos.map((p, i) => (p + normal[i] * 0.5) * cubie);
    const style: CSSProperties = {
      width: cubie,
      height: cubie,
      margin: -cubie / 2,
      transform: `translate3d(${at[0]}px, ${at[1]}px, ${at[2]}px) ${ORIENT[face]}`,
    };
    return (
      <div key={index} className="cube3d-sticker" style={style}>
        <span style={{ background: colors[state[index]] }} />
      </div>
    );
  };

  // Black squares that close the gap between the turning layer and the rest of the cube.
  const cap = (face: Face, facing: Face) => {
    const n = FACE_NORMALS[face];
    const size = cubie * 3;
    const style: CSSProperties = {
      width: size,
      height: size,
      margin: -size / 2,
      transform: `translate3d(${n[0] * 0.5 * cubie}px, ${n[1] * 0.5 * cubie}px, ${n[2] * 0.5 * cubie}px) ${ORIENT[facing]}`,
    };
    return <div className="cube3d-cap" style={style} />;
  };

  const all = STICKERS.map((s) => s.index);
  const turning = turn ? all.filter((i) => inLayer(STICKERS[i].pos, FACE_NORMALS[turn.face])) : [];
  const still = turn ? all.filter((i) => !turning.includes(i)) : all;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ x: Math.max(-90, Math.min(90, v.x - dy * 0.5)), y: v.y + dx * 0.5 }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      className="cube3d-scene"
      style={{ height: cubie * 5.4, perspective: cubie * 16 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label={`Cube with faces ${FACES.join(', ')}. Drag to look around.`}
    >
      <div className="cube3d" style={{ transform: `rotateX(${view.x}deg) rotateY(${view.y}deg) scaleY(-1)` }}>
        {still.map(sticker)}
        {turn && cap(turn.face, turn.face)}
        {turn && (
          <div className="cube3d-layer" ref={layerRef}>
            {turning.map(sticker)}
            {cap(turn.face, OPPOSITE[turn.face])}
          </div>
        )}
      </div>
    </div>
  );
}
