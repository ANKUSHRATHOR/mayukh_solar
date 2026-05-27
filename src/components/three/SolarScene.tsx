import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float } from '@react-three/drei';
import { useRef, Suspense } from 'react';
import * as THREE from 'three';

function Sun() {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    if (core.current) core.current.rotation.y = t * 0.15;
    if (halo.current) {
      const p = 1 + Math.sin(t * 0.8) * 0.04;
      halo.current.scale.setScalar(p);
    }
  });
  return (
    <group position={[1.6, 0.4, 0]}>
      <mesh ref={core}>
        <sphereGeometry args={[1.1, 64, 64]} />
        <meshBasicMaterial color={'#ff8a3d'} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[1.35, 48, 48]} />
        <meshBasicMaterial color={'#ffb070'} transparent opacity={0.18} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.7, 48, 48]} />
        <meshBasicMaterial color={'#ff6a1f'} transparent opacity={0.08} />
      </mesh>
      <pointLight intensity={3.5} distance={20} color={'#ffb070'} />
    </group>
  );
}

function Planet({ radius, speed, size, color, tilt = 0, offset = 0 }: { radius: number; speed: number; size: number; color: string; tilt?: number; offset?: number; }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.getElapsedTime() * speed + offset;
    if (ref.current) {
      ref.current.position.x = 1.6 + Math.cos(t) * radius;
      ref.current.position.z = Math.sin(t) * radius;
      ref.current.position.y = 0.4 + Math.sin(t) * tilt;
      ref.current.rotation.y += 0.01;
    }
  });
  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function Ring({ radius }: { radius: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[1.6, 0.4, 0]}>
      <ringGeometry args={[radius - 0.005, radius + 0.005, 128]} />
      <meshBasicMaterial color={'#ff8a3d'} transparent opacity={0.12} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SolarPanel() {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    if (ref.current) {
      ref.current.rotation.y = Math.sin(t * 0.3) * 0.3 - 0.4;
      ref.current.rotation.x = Math.sin(t * 0.2) * 0.1 - 0.2;
    }
  });
  return (
    <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.4}>
      <group ref={ref} position={[-3.2, -0.6, 0]} scale={0.9}>
        <mesh>
          <boxGeometry args={[1.8, 0.05, 1.2]} />
          <meshStandardMaterial color={'#1a2a44'} metalness={0.9} roughness={0.2} emissive={'#0a1a2a'} emissiveIntensity={0.4} />
        </mesh>
        {[-0.6, -0.2, 0.2, 0.6].map((x) =>
          [-0.4, 0, 0.4].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0.03, z]}>
              <boxGeometry args={[0.34, 0.01, 0.34]} />
              <meshStandardMaterial color={'#2a4a7a'} emissive={'#3a6aa8'} emissiveIntensity={0.6} metalness={0.8} roughness={0.3} />
            </mesh>
          ))
        )}
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.8, 12]} />
          <meshStandardMaterial color={'#3a3a3a'} metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
    </Float>
  );
}

export default function SolarScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 6.5], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.25} />
        <Stars radius={60} depth={40} count={2200} factor={3} saturation={0} fade speed={0.6} />
        <Sun />
        <Ring radius={2.0} />
        <Ring radius={2.9} />
        <Ring radius={3.8} />
        <Planet radius={2.0} speed={0.8} size={0.12} color={'#ffb070'} offset={0.2} />
        <Planet radius={2.9} speed={0.55} size={0.18} color={'#5cbdb9'} tilt={0.05} offset={1.5} />
        <Planet radius={3.8} speed={0.35} size={0.22} color={'#a78bfa'} tilt={0.08} offset={3} />
        <SolarPanel />
      </Suspense>
    </Canvas>
  );
}
