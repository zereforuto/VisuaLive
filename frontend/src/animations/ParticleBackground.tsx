import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Neural-network-inspired particle field. Renders behind all page content.
 * `lightweight` prop drops particle count and disables mouse-follow when
 * the live recognition pipeline is actively using the GPU, per the
 * requirement that decorative graphics never compete with inference.
 */
function Particles({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const frameRef = useRef(0);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    // Decorative motion should not compete with video inference or the UI.
    if (++frameRef.current % 3 !== 0) return;
    pointsRef.current.rotation.y += 0.0006;
    pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.05;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#4f8cff" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

export default function ParticleBackground({ lightweight = false }: { lightweight?: boolean }) {
  const count = lightweight ? 48 : 120;

  return (
    <div className="fixed inset-0 -z-10 bg-base">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={1} gl={{ powerPreference: "low-power", antialias: false }}>
        <ambientLight intensity={0.5} />
        <Particles count={count} />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-base/60 to-base pointer-events-none" />
    </div>
  );
}
