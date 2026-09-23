import { useEffect, useMemo, useRef } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COMPONENTS, smooth, track } from './story';
import { asset } from '../lib/asset';
import styles from './CalloutBox.module.css';

const MODEL = asset('/models/proxima-cad.glb');
interface Props { progressRef: React.RefObject<number>; chapter: number; component: number; }
const TARGETS = ['led_board', 'led_packages', 'control_board', 'wireless_module', 'usb_c', 'board_connector'];

export function LampModel({ progressRef, chapter, component }: Props) {
  const { scene: source } = useGLTF(MODEL);
  const root = useRef<THREE.Group>(null);
  const indicator = useRef<THREE.Group>(null);
  const { scene, parts, targets, materials } = useMemo(() => {
    const scene = source.clone(true);
    const parts: Record<string, THREE.Object3D> = {};
    const materials: THREE.Material[] = [];
    for (const name of ['diffuser', 'shell', 'base', 'led_board', 'control_board']) {
      const part = scene.getObjectByName(name);
      if (part) parts[name] = part;
    }
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const original = (Array.isArray(node.material) ? node.material[0] : node.material) as THREE.MeshStandardMaterial;
      const material = original.clone();
      let parent: THREE.Object3D | null = node;
      let name = node.name;
      while (parent) { if (parts[parent.name]) name = parent.name; parent = parent.parent; }
      if (name === 'diffuser') {
        material.color.set('#e5e2dc'); material.roughness = 0.58; material.metalness = 0;
        material.emissive.set('#ffd4a4'); material.emissiveIntensity = 0.055;
      } else if (name === 'shell' || name === 'base') {
        material.color.set('#222426'); material.roughness = 0.36; material.metalness = 0.23;
      }
      node.material = material;
      materials.push(material);
    });
    const targets = TARGETS.map((name, index) => {
      const target = scene.getObjectByName(name) ?? parts[index < 2 ? 'led_board' : 'control_board'];
      const point = new THREE.Vector3();
      if (target) new THREE.Box3().setFromObject(target).getCenter(point);
      if (index === 0) point.set(-0.78, 1.19, 0.55);
      if (index === 1) point.set(0.78, 1.2, 0.55);
      return point;
    });
    return { scene, parts, targets, materials };
  }, [source]);
  const animationParts = useRef(parts);
  useEffect(() => { animationParts.current = parts; return () => materials.forEach((material) => material.dispose()); }, [parts, materials]);
  useFrame(({ camera, size }) => {
    const p = progressRef.current;
    const parts = animationParts.current;
    const small = size.width < 700;
    const reassemble = 1 - smooth(0.91, 0.965, p);
    const lift = track(p, [[0, 0], [0.34, 0], [0.435, 1.9], [0.47, 1.9], [0.57, 8], [0.90, 8], [0.965, 0], [1, 0]]);
    if (parts.diffuser) { parts.diffuser.position.y = lift; parts.diffuser.visible = p < 0.56 || p > 0.92; }
    if (parts.base) parts.base.position.y = -1.55 * smooth(0.535, 0.625, p) * reassemble;
    if (parts.shell) parts.shell.position.y = -0.72 * smooth(0.565, 0.65, p) * reassemble;
    const rotation = track(p, [[0, -0.28], [0.28, -0.06], [0.45, -0.06], [0.63, Math.PI - 0.25], [0.86, Math.PI + 0.16], [0.91, Math.PI + 0.16], [0.975, Math.PI * 2 - 0.28], [1, Math.PI * 2 - 0.28]]);
    if (root.current) root.current.rotation.y = rotation;
    const close = smooth(0.68, 0.77, p) * (1 - smooth(0.89, 0.97, p));
    const inside = smooth(0.50, 0.65, p) * (1 - smooth(0.91, 0.975, p));
    const targetY = track(p, [[0, 1.95], [0.28, 1.9], [0.44, 3.05], [0.52, 2.3], [0.63, 1.12], [0.90, 1.12], [0.98, 1.95], [1, 1.95]]);
    const cameraY = track(p, [[0, 3.3], [0.28, 3.1], [0.45, 4.4], [0.64, 4.8], [0.76, 3.55], [0.90, 3.55], [0.98, 3.3], [1, 3.3]]);
    const cameraZ = track(p, [[0, 10.8], [0.27, 8.75], [0.45, 13.4], [0.64, 4.5], [0.78, 3.8], [0.90, 3.8], [0.98, 10.2], [1, 10.2]]);
    camera.position.set(small ? 0 : inside * 0.48, cameraY, cameraZ * (small ? 1.23 : 1));
    camera.lookAt(small ? 0 : inside * 0.65, targetY, close * 0.47);
    const cam = camera as THREE.PerspectiveCamera;
    const fov = small ? 34 : 30;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (indicator.current) {
      indicator.current.position.copy(targets[component]);
      indicator.current.visible = chapter === 3 && p > 0.60;
    }
  });
  return <>
    <group ref={root}>
      <primitive object={scene} />
      {chapter === 1 && <>
        <Html position={[0.74, 2.9, 0]} zIndexRange={[8, 1]} style={{ pointerEvents: 'none' }}><div className={styles.callout} data-side="right"><span className={styles.dot} /><span className={styles.line} /><div className={styles.box}><span className={styles.number}>01 / THE DIFFUSER</span><strong>Soft light. Clear purpose.</strong><p>A hollow white diffuser shapes the light around it.</p></div></div></Html>
        <Html position={[-1.08, 1.17, 0]} zIndexRange={[8, 1]} style={{ pointerEvents: 'none' }}><div className={styles.callout} data-side="left"><span className={styles.dot} /><span className={styles.line} /><div className={styles.box}><span className={styles.number}>02 / THE HOUSING</span><strong>Technology, tucked away.</strong><p>A two-piece black ring houses the custom electronics.</p></div></div></Html>
      </>}
      {chapter === 3 && <group ref={indicator}>
        <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}><div className={styles.hotspot}><span>{String(component + 1).padStart(2, '0')}</span><span className={styles.hotspotTitle}>{COMPONENTS[component].label}</span></div></Html>
      </group>}
    </group>
  </>;
}
