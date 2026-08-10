import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, step, type GameState, type Input } from "./engine";
import { draw } from "./render";
import { Joystick } from "./Joystick";

type Phase = "menu" | "playing" | "over";

export function BrawlGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(createGame());
  const inputRef = useRef<Input>({
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    shooting: false,
    superPressed: false,
  });
  const keys = useRef<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, score: 0, wave: 0, super: 0, enemies: 0 });
  const [best, setBest] = useState(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const stored = Number(localStorage.getItem("brawl-best") ?? 0);
    if (stored) setBest(stored);
  }, []);

  const start = useCallback(() => {
    gameRef.current = createGame();
    inputRef.current = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      shooting: false,
      superPressed: false,
    };
    setPhase("playing");
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key === " ") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      const inp = inputRef.current;

      const k = keys.current;
      const kx = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
      const ky = (k["s"] || k["arrowdown"] ? 1 : 0) - (k["w"] || k["arrowup"] ? 1 : 0);
      const move = kx || ky ? { x: kx, y: ky } : inp.move;
      const len = Math.hypot(move.x, move.y) || 1;
      const norm = len > 1 ? { x: move.x / len, y: move.y / len } : move;

      if (phaseRef.current === "playing") {
        step(
          g,
          {
            move: norm,
            aim: inp.aim,
            shooting: inp.shooting || !!k[" "],
            superPressed: inp.superPressed || !!k["e"],
          },
          dt,
        );
        inp.superPressed = false;
        if (g.over) {
          phaseRef.current = "over";
          setPhase("over");
          setBest((b) => {
            const nb = Math.max(b, g.score);
            localStorage.setItem("brawl-best", String(nb));
            return nb;
          });
        }
      } else {
        step(g, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, shooting: false, superPressed: false }, dt);
      }

      const r = canvas.getBoundingClientRect();
      draw(ctx, g, r.width, r.height);
      setHud({
        hp: Math.round(g.hero.hp),
        maxHp: g.hero.maxHp,
        score: g.score,
        wave: g.wave,
        super: Math.round(g.super),
        enemies: g.enemies.length,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const superReady = hud.super >= 100;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="rounded-xl bg-card/80 px-3 py-2 backdrop-blur">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Poäng
          </p>
          <p className="text-2xl leading-none font-black text-primary">{hud.score}</p>
        </div>
        <div className="rounded-xl bg-card/80 px-3 py-2 text-right backdrop-blur">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Våg {hud.wave}
          </p>
          <p className="text-sm font-bold text-accent">{hud.enemies} fiender</p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-52 px-6">
        <div className="mx-auto max-w-sm space-y-2">
          <div className="h-3 overflow-hidden rounded-full border border-border bg-card/80">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
            />
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-border bg-card/80">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${hud.super}%` }}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      {phase === "playing" && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 pb-10">
          <Joystick
            label="Rör"
            onChange={(x, y) => {
              inputRef.current.move = { x, y };
            }}
          />
          <div className="flex flex-col items-end gap-4">
            <button
              type="button"
              disabled={!superReady}
              onPointerDown={() => {
                inputRef.current.superPressed = true;
              }}
              className={`size-16 touch-none rounded-full border-2 text-xs font-black tracking-wider uppercase transition ${
                superReady
                  ? "border-accent bg-accent text-accent-foreground shadow-[0_0_24px_var(--accent)]"
                  : "border-border bg-card/70 text-muted-foreground"
              }`}
            >
              Super
            </button>
            <Joystick
              label="Skjut"
              variant="shoot"
              onChange={(x, y) => {
                inputRef.current.aim = { x, y };
                inputRef.current.shooting = Math.hypot(x, y) > 0.2;
              }}
              onRelease={() => {
                inputRef.current.shooting = false;
                inputRef.current.aim = { x: 0, y: 0 };
              }}
            />
          </div>
        </div>
      )}

      {/* Overlays */}
      {phase !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/85 px-8 text-center backdrop-blur-sm">
          <div>
            <h1 className="text-5xl font-black tracking-tight text-primary drop-shadow">
              ARENA BRAWL
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {phase === "menu"
                ? "Överlev våg efter våg. Två spakar: vänster rör dig, höger siktar och skjuter."
                : `Du föll på våg ${hud.wave}.`}
            </p>
          </div>
          {phase === "over" && (
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Poäng
                </p>
                <p className="text-3xl font-black text-foreground">{hud.score}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Rekord
                </p>
                <p className="text-3xl font-black text-accent">{best}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-primary px-10 py-4 text-lg font-black tracking-wide text-primary-foreground uppercase shadow-[0_8px_0_oklch(0.6_0.16_85)] transition active:translate-y-1 active:shadow-[0_4px_0_oklch(0.6_0.16_85)]"
          >
            {phase === "menu" ? "Spela" : "Igen"}
          </button>
          <p className="text-xs text-muted-foreground">
            Dator: WASD för att röra dig, mellanslag för att skjuta, E för super.
          </p>
        </div>
      )}
    </div>
  );
}