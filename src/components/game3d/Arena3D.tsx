import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { ARENA_H, ARENA_W, WALLS, step, type GameState, type Input } from "@/components/game/engine";
import { ENEMY_COLORS, HERO_COLORS, S } from "./palette";
import { Fighter } from "./Fighter";

const MAX_ENEMIES = 44;
const MAX_BULLETS = 220;
const MAX_PICKUPS = 20;

const wx = (x: number) => (x - ARENA_W / 2) * S;
const wz = (y: number) => (y - ARENA_H / 2) * S;

type Slot = { group: THREE.Group; mats: THREE.MeshStandardMaterial[] };

function EnemySlot({ register }: { register: (s: Slot | null) => void }) {
  const mats = useMemo(
    () => [0, 1].map(() => new THREE.MeshStandardMaterial({ color: "#e2544b", roughness: 0.45 })),
    [],
  );
  const outline = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#141020", side: THREE.BackSide }),
    [],
  );
  return (
    <group
      visible={false}
      ref={(g) => {
        register(g ? { group: g, mats } : null);
      }}
    >
      <mesh position={[0, 0.62, 0]} castShadow material={mats[0]}>
        <capsuleGeometry args={[0.5, 0.6, 8, 18]} />
      </mesh>
      <mesh position={[0, 0.62, 0]} scale={1.07} material={outline}>
        <capsuleGeometry args={[0.5, 0.6, 8, 18]} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow material={mats[1]}>
        <sphereGeometry args={[0.46, 20, 16]} />
      </mesh>
      <mesh position={[0, 1.5, 0]} scale={1.07} material={outline}>
        <sphereGeometry args={[0.46, 20, 16]} />
      </mesh>
      <mesh position={[-0.16, 1.56, 0.4]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshBasicMaterial color="#fff8f0" />
      </mesh>
      <mesh position={[0.16, 1.56, 0.4]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshBasicMaterial color="#fff8f0" />
      </mesh>
      <mesh position={[-0.16, 1.56, 0.5]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color="#150f1e" />
      </mesh>
      <mesh position={[0.16, 1.56, 0.5]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color="#150f1e" />
      </mesh>
    </group>
  );
}

type Props = {
  game: React.RefObject<GameState | null>;
  input: React.RefObject<Input>;
  paused: boolean;
};

export function Arena3D({ game, input, paused }: Props) {
  const heroRef = useRef<THREE.Group>(null);
  const heroTiltRef = useRef<THREE.Group>(null);
  const enemySlots = useRef<(Slot | null)[]>([]);
  const bulletRefs = useRef<(THREE.Mesh | null)[]>([]);
  const pickupRefs = useRef<(THREE.Mesh | null)[]>([]);
  const camTarget = useRef(new THREE.Vector3());
  const { camera } = useThree();

  const bulletMats = useMemo(
    () =>
      Array.from(
        { length: MAX_BULLETS },
        () => new THREE.MeshBasicMaterial({ color: "#ffd166", toneMapped: false }),
      ),
    [],
  );
  const pickupMats = useMemo(
    () =>
      Array.from(
        { length: MAX_PICKUPS },
        () =>
          new THREE.MeshStandardMaterial({
            color: "#7CFFB2",
            emissive: new THREE.Color("#2fae6d"),
            roughness: 0.3,
          }),
      ),
    [],
  );

  useEffect(() => {
    camera.position.set(0, 15, 12);
  }, [camera]);

  useFrame((_, raw) => {
    const g = game.current;
    if (!g) return;
    const dt = Math.min(raw, 0.05);
    if (!paused) step(g, input.current, dt);

    // hero
    const h = g.hero;
    const hx = wx(h.pos.x);
    const hz = wz(h.pos.y);
    if (heroRef.current) {
      heroRef.current.position.set(hx, 0, hz);
      const face = Math.atan2(Math.cos(h.aim), Math.sin(h.aim));
      heroRef.current.rotation.y = face;
      const bob = Math.sin(g.time * 11) * 0.05;
      heroRef.current.position.y = Math.abs(bob) * (input.current.move.x || input.current.move.y ? 1 : 0.25);
    }
    if (heroTiltRef.current) {
      heroTiltRef.current.rotation.x = Math.sin(g.time * 11) * 0.04;
      const flash = h.hitFlash;
      heroTiltRef.current.scale.setScalar(1 + flash * 0.08);
    }

    // camera follows with a small look-ahead toward the aim
    const la = 2.2;
    camTarget.current.set(hx + Math.cos(h.aim) * la, 0, hz + Math.sin(h.aim) * la);
    const shake = g.shake * 0.012;
    camera.position.lerp(
      new THREE.Vector3(camTarget.current.x, 12.6, camTarget.current.z + 13.4),
      1 - Math.exp(-6 * dt),
    );
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.lookAt(camTarget.current.x, 0.6, camTarget.current.z - 1.2);

    // enemies
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const slot = enemySlots.current[i];
      if (!slot) continue;
      const e = g.enemies[i];
      if (!e) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      const sc = (e.radius / 24) * (e.enemyKind === "boss" ? 1.15 : 1);
      slot.group.scale.setScalar(sc * (1 + e.hitFlash * 0.12));
      slot.group.position.set(wx(e.pos.x), 0, wz(e.pos.y));
      slot.group.rotation.y = Math.atan2(Math.cos(e.aim), Math.sin(e.aim));
      const base = ENEMY_COLORS[e.enemyKind];
      for (const m of slot.mats) {
        m.color.set(base);
        if (e.hitFlash > 0) m.color.lerp(new THREE.Color("#ffffff"), Math.min(1, e.hitFlash));
      }
    }

    // bullets
    for (let i = 0; i < MAX_BULLETS; i++) {
      const m = bulletRefs.current[i];
      if (!m) continue;
      const b = g.bullets[i];
      if (!b) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(wx(b.pos.x), 0.85, wz(b.pos.y));
      const s = Math.max(0.14, b.radius * S * 2.2);
      m.scale.set(s, s, s * 2);
      m.rotation.y = Math.atan2(b.vel.x, b.vel.y);
      bulletMats[i]!.color.set(b.owner === "hero" ? "#ffe066" : "#ff5b6e");
    }

    // pickups
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const m = pickupRefs.current[i];
      if (!m) continue;
      const p = g.pickups[i];
      if (!p) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(wx(p.pos.x), 0.7 + Math.sin(p.bob) * 0.15, wz(p.pos.y));
      m.rotation.y += dt * 2;
    }
  });

  const heroSkin = HERO_COLORS[game.current?.brawler.id ?? "blaze"] ?? HERO_COLORS.blaze!;

  return (
    <>
      <hemisphereLight args={["#cfe8ff", "#2c2a4a", 0.9]} />
      <directionalLight
        position={[14, 24, 10]}
        intensity={2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      <directionalLight position={[-10, 8, -12]} intensity={0.5} color="#8fd9ff" />

      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[ARENA_W * S, ARENA_H * S]} />
        <meshStandardMaterial color="#3f8f52" roughness={0.95} />
      </mesh>
      <gridHelper args={[ARENA_W * S, 20, "#356f45", "#377a49"]} position={[0, 0.01, 0]} />

      {/* arena rim */}
      {[
        [0, -(ARENA_H * S) / 2 - 0.5, ARENA_W * S + 2, 1],
        [0, (ARENA_H * S) / 2 + 0.5, ARENA_W * S + 2, 1],
        [-(ARENA_W * S) / 2 - 0.5, 0, 1, ARENA_H * S],
        [(ARENA_W * S) / 2 + 0.5, 0, 1, ARENA_H * S],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x!, 0.7, z!]} castShadow receiveShadow>
          <boxGeometry args={[w!, 1.4, d!]} />
          <meshStandardMaterial color="#5b4632" roughness={0.9} />
        </mesh>
      ))}

      {/* cover walls */}
      {WALLS.map((w, i) => (
        <group key={i} position={[wx(w.x + w.w / 2), 0, wz(w.y + w.h / 2)]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[w.w * S, 1.1, w.h * S]} />
            <meshStandardMaterial color="#7a5c3e" roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.14, 0]} castShadow>
            <boxGeometry args={[w.w * S + 0.12, 0.16, w.h * S + 0.12]} />
            <meshStandardMaterial color="#9c7a52" roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* hero */}
      <group ref={heroRef}>
        <group ref={heroTiltRef}>
          <Fighter
            color={heroSkin.color}
            accent={heroSkin.accent}
            scale={1}
            build={game.current?.brawler.build}
          />
        </group>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.75, 0.92, 28]} />
          <meshBasicMaterial color={heroSkin.accent} transparent opacity={0.55} />
        </mesh>
      </group>

      {Array.from({ length: MAX_ENEMIES }, (_, i) => (
        <EnemySlot
          key={i}
          register={(s) => {
            enemySlots.current[i] = s;
          }}
        />
      ))}

      {Array.from({ length: MAX_BULLETS }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          material={bulletMats[i]}
          ref={(m) => {
            bulletRefs.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.5, 10, 8]} />
        </mesh>
      ))}

      {Array.from({ length: MAX_PICKUPS }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          castShadow
          material={pickupMats[i]}
          ref={(m) => {
            pickupRefs.current[i] = m;
          }}
        >
          <icosahedronGeometry args={[0.42, 0]} />
        </mesh>
      ))}
    </>
  );
}
