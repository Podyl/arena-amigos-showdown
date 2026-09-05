import * as THREE from "three";
import { useMemo } from "react";

type Props = {
  color: string;
  accent?: string;
  scale?: number;
  build?: "bulky" | "lanky" | "tank" | "nimble";
};

/**
 * Chunky, cartoon-proportioned fighter built from rounded primitives with a
 * dark outline shell — the silhouette style used by mobile arena brawlers.
 */
export function Fighter({ color, accent = "#ffffff", scale = 1, build = "bulky" }: Props) {
  const dims = useMemo(() => {
    switch (build) {
      case "lanky":
        return { body: [0.42, 0.85] as const, head: 0.52, legs: 0.34 };
      case "tank":
        return { body: [0.62, 0.6] as const, head: 0.56, legs: 0.24 };
      case "nimble":
        return { body: [0.4, 0.7] as const, head: 0.5, legs: 0.3 };
      default:
        return { body: [0.52, 0.7] as const, head: 0.58, legs: 0.28 };
    }
  }, [build]);

  const outline = useMemo(() => new THREE.MeshBasicMaterial({ color: "#12101a", side: THREE.BackSide }), []);

  return (
    <group scale={scale}>
      {/* legs */}
      <mesh position={[-0.22, dims.legs, 0]} castShadow>
        <capsuleGeometry args={[0.16, dims.legs, 6, 12]} />
        <meshStandardMaterial color="#2c2740" roughness={0.7} />
      </mesh>
      <mesh position={[0.22, dims.legs, 0]} castShadow>
        <capsuleGeometry args={[0.16, dims.legs, 6, 12]} />
        <meshStandardMaterial color="#2c2740" roughness={0.7} />
      </mesh>

      {/* torso */}
      <group position={[0, dims.legs + dims.body[1] * 0.75, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[dims.body[0], dims.body[1], 8, 20]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
        </mesh>
        <mesh scale={1.06} material={outline}>
          <capsuleGeometry args={[dims.body[0], dims.body[1], 8, 20]} />
        </mesh>
        {/* arms */}
        <mesh position={[-dims.body[0] - 0.06, -0.1, 0.1]} rotation={[0, 0, 0.35]} castShadow>
          <capsuleGeometry args={[0.15, 0.34, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[dims.body[0] + 0.06, -0.1, 0.1]} rotation={[0, 0, -0.35]} castShadow>
          <capsuleGeometry args={[0.15, 0.34, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>

      {/* head */}
      <group position={[0, dims.legs + dims.body[1] * 1.5 + dims.head * 0.55, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[dims.head, 24, 20]} />
          <meshStandardMaterial color="#f4c9a4" roughness={0.6} />
        </mesh>
        <mesh scale={1.05} material={outline}>
          <sphereGeometry args={[dims.head, 24, 20]} />
        </mesh>
        {/* eyes look along +Z (facing direction) */}
        <mesh position={[-0.18, 0.06, dims.head * 0.88]}>
          <sphereGeometry args={[0.13, 14, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.18, 0.06, dims.head * 0.88]}>
          <sphereGeometry args={[0.13, 14, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[-0.18, 0.06, dims.head * 0.98]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshBasicMaterial color="#1b1526" />
        </mesh>
        <mesh position={[0.18, 0.06, dims.head * 0.98]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshBasicMaterial color="#1b1526" />
        </mesh>
        {/* cap / crest */}
        <mesh position={[0, dims.head * 0.72, 0]} castShadow>
          <sphereGeometry args={[dims.head * 0.82, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={accent} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
