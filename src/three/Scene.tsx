import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { LampModel } from './LampModel';

interface Props { progressRef: React.RefObject<number>; chapter: number; component: number; }
export function Scene(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} style={{ width: '100%', height: '100%' }} role="img" aria-label="Interactive 3D model of the actual PROXIMA lamp, reconstructed from the product CAD files">
    <Canvas camera={{ position: [0, 3.5, 11], fov: 30, near: 0.1, far: 70 }} dpr={[1, 1.75]} frameloop={visible ? 'always' : 'never'} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} fallback={<p>Explore the physical prototype below.</p>}>
      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#f0ebe3', '#655342', 0.55]} />
      <directionalLight position={[4, 6, 5]} intensity={2.5} color="#fff3e4" />
      <directionalLight position={[-4, 2, 2]} intensity={0.7} color="#e0e9ff" />
      <directionalLight position={[0, 4, -4]} intensity={1.75} color="#e4b081" />
      <pointLight position={[0, 0.8, 2]} intensity={0.35} color="#ffce9c" />
      <Suspense fallback={null}><LampModel {...props} /></Suspense>
    </Canvas>
  </div>;
}
