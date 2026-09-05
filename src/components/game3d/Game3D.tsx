import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { createGame, type GameState, type Input } from "@/components/game/engine";
import { BRAWLERS } from "@/components/game/characters";
import { Joystick } from "@/components/game/Joystick";
import { Arena3D } from "./Arena3D";
import { HERO_COLORS } from "./palette";

type Phase = "menu" | "playing" | "over";

export function Game3D() {
  const game = useRef<GameState | null>(null);
  const input = useRef<Input>({
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    shooting: false,
    superPressed: false,
  });
  const keys = useRef<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("menu");
  const [pick, setPick] = useState(BRAWLERS[0]!.id);
  const [hud, setHud] = useState({ hp: 1, wave: 0, score: 0, super: 0, ammo: 3, banner: "" });

  const start = useCallback((id: string) => {
    game.current = createGame(id);
    setPhase("playing");
  }, []);

  // keyboard controls
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key === " ") input.current.superPressed = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
      if (e.key === " ") input.current.superPressed = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // keyboard + HUD polling loop (10 Hz) — never per animation frame
  useEffect(() => {
    const t = setInterval(() => {
      const k = keys.current;
      const mx = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
      const my = (k["s"] || k["arrowdown"] ? 1 : 0) - (k["w"] || k["arrowup"] ? 1 : 0);
      if (mx || my) {
        const l = Math.hypot(mx, my) || 1;
        input.current.move = { x: mx / l, y: my / l };
      } else if (!touchMove.current) {
        input.current.move = { x: 0, y: 0 };
      }
      const g = game.current;
      if (!g) return;
      setHud({
        hp: g.hero.maxHp ? g.hero.hp / g.hero.maxHp : 0,
        wave: g.wave,
        score: g.score,
        super: g.super,
        ammo: g.ammo,
        banner: g.banner?.text ?? "",
      });
      if (g.over) setPhase("over");
    }, 100);
    return () => clearInterval(t);
  }, []);

  const touchMove = useRef(false);

  const brawler = BRAWLERS.find((b) => b.id === pick) ?? BRAWLERS[0]!;

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#101425]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 15, 12], fov: 52 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#101425"]} />
        <fog attach="fog" args={["#101425", 26, 46]} />
        <Arena3D game={game} input={input} paused={phase !== "playing"} />
      </Canvas>

      {phase === "playing" && (
        <>
          {/* HUD */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <div className="w-40">
              <div className="h-3 overflow-hidden rounded-full border border-white/20 bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-[width] duration-150"
                  style={{ width: `${Math.max(0, hud.hp) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${i < hud.ammo ? "bg-sky-300" : "bg-white/20"}`}
                  />
                ))}
              </div>
            </div>
            <div className="text-right font-black text-white drop-shadow">
              <div className="text-2xl leading-none">{hud.score}</div>
              <div className="text-[11px] tracking-widest text-white/70 uppercase">
                Våg {hud.wave}
              </div>
            </div>
          </div>

          {hud.banner && (
            <div className="pointer-events-none absolute inset-x-0 top-1/4 text-center">
              <span className="rounded-2xl bg-black/50 px-5 py-2 text-2xl font-black tracking-wide text-amber-300 uppercase drop-shadow">
                {hud.banner}
              </span>
            </div>
          )}

          {/* controls */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 pb-10">
            <Joystick
              label="Rör dig"
              onChange={(x, y) => {
                touchMove.current = !!(x || y);
                input.current.move = { x, y };
              }}
            />
            <div className="flex flex-col items-end gap-4">
              <button
                type="button"
                aria-label="Super"
                onPointerDown={() => {
                  input.current.superPressed = true;
                }}
                onPointerUp={() => {
                  input.current.superPressed = false;
                }}
                className="size-16 rounded-full border-2 border-amber-300 text-xs font-black text-amber-200 uppercase disabled:opacity-40"
                style={{
                  background: `conic-gradient(rgb(251 191 36 / 0.85) ${hud.super * 3.6}deg, rgb(0 0 0 / 0.45) 0deg)`,
                }}
              >
                Super
              </button>
              <Joystick
                label="Skjut"
                variant="shoot"
                onPress={() => {
                  input.current.shooting = true;
                }}
                onRelease={() => {
                  input.current.shooting = false;
                  input.current.aim = { x: 0, y: 0 };
                }}
                onChange={(x, y) => {
                  input.current.aim = { x, y };
                }}
              />
            </div>
          </div>
        </>
      )}

      {phase !== "playing" && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#181d33]/95 p-6 text-center shadow-2xl">
            <h1 className="text-3xl font-black tracking-tight text-white">Arena Brawl 3D</h1>
            <p className="mt-1 text-sm text-white/60">
              {phase === "over"
                ? `Matchen är slut – ${hud.score} poäng, våg ${hud.wave}.`
                : "Välj din brawler och kliv in i arenan."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {BRAWLERS.map((b) => {
                const c = HERO_COLORS[b.id] ?? HERO_COLORS.blaze!;
                const on = b.id === pick;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setPick(b.id)}
                    className={`rounded-2xl border-2 p-3 text-left transition ${
                      on ? "border-amber-300 bg-white/10" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      className="mb-2 block size-8 rounded-full"
                      style={{ background: c.color, boxShadow: `0 0 14px ${c.accent}` }}
                    />
                    <span className="block text-sm font-bold text-white">{b.name}</span>
                    <span className="block text-[11px] leading-tight text-white/55">
                      {b.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => start(brawler.id)}
              className="mt-5 w-full rounded-2xl bg-amber-400 py-3 text-lg font-black text-[#20160a] uppercase shadow-lg active:scale-95"
            >
              {phase === "over" ? "Spela igen" : "Spela"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
