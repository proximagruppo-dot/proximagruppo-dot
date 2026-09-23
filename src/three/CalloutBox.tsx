import { useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { PARTS, ease, smoothstep, type Callout } from './layout';
import styles from './CalloutBox.module.css';

interface Props {
  callout: Callout;
  progressRef: React.RefObject<number>;
}

const tmp = new THREE.Vector3();

export function CalloutBox({ callout, progressRef }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isPartAnchor = typeof callout.anchor === 'string';
  const part = isPartAnchor ? PARTS[callout.anchor as string] : null;

  useFrame(() => {
    const p = progressRef.current ?? 0;
    const group = groupRef.current;
    if (group) {
      if (part) {
        const t = ease(smoothstep(part.range[0], part.range[1], p));
        const overshoot = t + 0.14; // float just past the part's resting explode position
        tmp.set(
          part.center[0] + part.offset[0] * overshoot,
          part.center[1] + part.offset[1] * overshoot,
          part.center[2] + part.offset[2] * overshoot,
        );
      } else {
        const [x, y, z] = callout.anchor as [number, number, number];
        tmp.set(x, y, z);
      }
      group.position.copy(tmp);
    }

    const wrap = wrapRef.current;
    if (wrap) {
      const [start, end] = callout.range;
      const fadeIn = smoothstep(start, start + 0.06, p);
      const fadeOut = end >= 0.999 ? 1 : 1 - smoothstep(end - 0.06, end, p);
      const o = fadeIn * fadeOut;
      wrap.style.opacity = String(o);
      wrap.style.transform = `translateY(${(1 - o) * 6}px)`;
    }
  });

  return (
    <group ref={groupRef}>
      <Html transform={false} occlude={false} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={wrapRef} className={styles.wrap} data-side={callout.side}>
          <span className={styles.dot} />
          <span className={styles.line} />
          <div className={styles.box}>
            <div className={styles.title}>{callout.title}</div>
            <div className={styles.body}>{callout.body}</div>
          </div>
        </div>
      </Html>
    </group>
  );
}
