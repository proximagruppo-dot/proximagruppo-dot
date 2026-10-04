import { useEffect, useMemo, useRef } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COMPONENTS, REASSEMBLY_START, REASSEMBLY_END, smooth, track } from './story';
import { asset } from '../lib/asset';
import styles from './CalloutBox.module.css';

const MODEL = asset('/models/proxima-cad.glb');
interface Props { progressRef: React.RefObject<number>; chapter: number; component: number; present?: boolean; reassembling?: boolean; }
const TARGETS = ['led_board', 'led_packages', 'control_board', 'wireless_module', 'usb_c', 'board_connector'];

export function LampModel({ progressRef, chapter, component, present, reassembling }: Props) {
  const { scene: source } = useGLTF(MODEL);
  const root = useRef<THREE.Group>(null);
  const indicator = useRef<THREE.Group>(null);
  const { scene, parts, targets, materials, reassemblyFadeMaterials } = useMemo(() => {
    const scene = source.clone(true);
    const parts: Record<string, THREE.Object3D> = {};
    const materials: THREE.Material[] = [];
    // The housing (diffuser + shell) pops back into view near the end of the component tour --
    // these materials get faded in (see `settle` in useFrame) instead of just flipping
    // `visible` on, so the housing doesn't snap into frame mid-flight, disconnected from the
    // boards it's supposed to be re-covering.
    const reassemblyFadeMaterials: THREE.Material[] = [];
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
      if (name === 'diffuser' || name === 'shell') {
        material.transparent = true;
        reassemblyFadeMaterials.push(material);
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
    return { scene, parts, targets, materials, reassemblyFadeMaterials };
  }, [source]);
  const animationParts = useRef(parts);
  const fadeMaterials = useRef(reassemblyFadeMaterials);
  useEffect(() => {
    animationParts.current = parts;
    fadeMaterials.current = reassemblyFadeMaterials;
    return () => materials.forEach((material) => material.dispose());
  }, [parts, materials, reassemblyFadeMaterials]);
  useFrame(({ camera, size }) => {
    const p = progressRef.current;
    const parts = animationParts.current;
    const small = size.width < 700;
    const reassemble = 1 - smooth(0.91, 0.965, p);
    const lift = track(p, [[0, 0], [0.34, 0], [0.435, 1.9], [0.47, 1.9], [0.57, 8], [REASSEMBLY_START, 8], [REASSEMBLY_END, 0], [1, 0]]);
    // The housing used to just flip `visible` on at a fixed progress -- a hard boolean snap
    // that popped the diffuser/shell into frame already partway through their descent (still
    // ~6 of 8 units up), disconnected from the boards below. Fade them in across the same
    // window the `lift` track uses to bring them back down, so the reveal is continuous with
    // the motion instead of an instant pop. `settle` stays 1 (fully opaque) everywhere outside
    // that window, including the initial assembled state at p=0.
    const settle = p > REASSEMBLY_START ? smooth(REASSEMBLY_START, REASSEMBLY_END, p) : 1;
    fadeMaterials.current.forEach((material) => { (material as THREE.MeshStandardMaterial).opacity = settle; });
    if (parts.diffuser) { parts.diffuser.position.y = lift; parts.diffuser.visible = p < 0.56 || p > REASSEMBLY_START; }
    if (parts.base) parts.base.position.y = -1.55 * smooth(0.535, 0.625, p) * reassemble;
    // The black outer band used to just sink a little, leaving its rim framing (and visually
    // overlapping) the boards it's supposed to reveal. Lift it fully out of frame instead, in
    // lockstep with the diffuser, so the electronics show against open space, not through a ring.
    if (parts.shell) { parts.shell.position.y = lift; parts.shell.visible = p < 0.56 || p > REASSEMBLY_START; }
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
      // Stop pointing a hotspot at "the part you're inspecting" once reassembly starts --
      // componentAt() has no upper bound and keeps reporting the last component (06) for
      // every progress past it, so without this the hotspot kept labelling a specific
      // disassembled PCB part while the housing was already closing back over it.
      indicator.current.visible = !present && chapter === 3 && p > 0.60 && p < REASSEMBLY_START;
    }
  });
  return <>
    <group ref={root}>
      <primitive object={scene} />
      {!present && chapter === 1 && <>
        <Html position={[0.74, 2.9, 0]} zIndexRange={[8, 1]} style={{ pointerEvents: 'none' }}><div className={styles.callout} data-side="right"><span className={styles.dot} /><span className={styles.line} /><div className={styles.box}><span className={styles.number}>01 / THE DIFFUSER</span><strong>Soft light. Clear purpose.</strong><p>A hollow white diffuser shapes the light around it.</p></div></div></Html>
        <Html position={[-1.08, 1.17, 0]} zIndexRange={[8, 1]} style={{ pointerEvents: 'none' }}><div className={styles.callout} data-side="left"><span className={styles.dot} /><span className={styles.line} /><div className={styles.box}><span className={styles.number}>02 / THE HOUSING</span><strong>Technology, tucked away.</strong><p>A two-piece black ring houses the custom electronics.</p></div></div></Html>
      </>}
      {/* drei's <Html> portals into the DOM outside the WebGL tree, so it ignores the group's
          imperative `visible` flag set in useFrame -- it has to be gated here too, or the
          hotspot (and its "componentAt() never resets" staleness) keeps showing through the
          reassembly animation even once the 3D object itself is hidden. */}
      {!present && chapter === 3 && !reassembling && <group ref={indicator}>
        <Html center zIndexRange={[9, 1]} style={{ pointerEvents: 'none' }}><div className={styles.hotspot}><span>{String(component + 1).padStart(2, '0')}</span><span className={styles.hotspotTitle}>{COMPONENTS[component].label}</span></div></Html>
      </group>}
    </group>
  </>;
}
