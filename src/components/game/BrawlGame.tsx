import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, step, type GameState, type Input } from "./engine";
import { draw } from "./render";
import { Joystick } from "./Joystick";
import { BRAWLERS } from "./characters";
import { isMuted, setMuted, unlockAudio } from "./audio";
import { activeSynergies, SYNERGIES } from "./synergy";
import {
  finishMatch,
  loadProfile,
  powerLevel,
  rankFor,
  seasonDaysLeft,
  totalTrophies,
  xpInLevel,
  type MatchResult,
  type Profile,
} from "./progression";

type Phase = "menu" | "select" | "playing" | "over" | "ranks";

const emptyInput = (): Input => ({
  move: { x: 0, y: 0 },
  aim: { x: 0, y: 0 },
  shooting: false,
  superPressed: false,
});

export function BrawlGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(createGame("blaze"));
  const inputRef = useRef<Input>(emptyInput());
  const keys = useRef<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  const [pick, setPick] = useState(BRAWLERS[0]!.id);
  const [muted, setMutedState] = useState(false);
  const [hud, setHud] = useState({
    hp: 100,
    maxHp: 100,
    score: 0,
    wave: 0,
    super: 0,
    enemies: 0,
    banner: "",
    synergies: [] as { name: string; color: string }[],
    boss: null as { hp: number; maxHp: number } | null,
    buffs: { damage: 0, speed: 0, rapid: 0, shield: 0 },
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const p = loadProfile();
    profileRef.current = p;
    setProfile(p);
    setMutedState(isMuted());
  }, []);

  const start = useCallback((id: string) => {
    unlockAudio();
    const lvl = powerLevel(profileRef.current?.brawlers[id]?.xp ?? 0);
    gameRef.current = createGame(id, lvl);
    inputRef.current = emptyInput();
    setResult(null);
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
          const prof = profileRef.current;
          if (prof) {
            const res = finishMatch(prof, g.brawler.id, g.score, g.wave, g.bossKills);
            setResult(res);
            setProfile({ ...prof });
          }
        }
      } else {
        step(g, emptyInput(), dt);
      }

      const r = canvas.getBoundingClientRect();
      draw(ctx, g, r.width, r.height);
      const boss = g.enemies.find((e) => e.enemyKind === "boss");
      setHud({
        hp: Math.round(g.hero.hp),
        maxHp: g.hero.maxHp,
        score: g.score,
        wave: g.wave,
        super: Math.round(g.super),
        enemies: g.enemies.length,
        banner: g.banner?.text ?? "",
        synergies: activeSynergies(g.buffs).map((x) => ({ name: x.name, color: x.color })),
        boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
        buffs: { ...g.buffs },
      });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const superReady = hud.super >= 100;
  const buffChips = [
    hud.buffs.damage > 0 && { label: "2× SKADA", t: hud.buffs.damage },
    hud.buffs.speed > 0 && { label: "FART", t: hud.buffs.speed },
    hud.buffs.rapid > 0 && { label: "SNABBELD", t: hud.buffs.rapid },
    hud.buffs.shield > 0 && { label: "SKÖLD", t: hud.buffs.shield },
  ].filter(Boolean) as { label: string; t: number }[];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="rounded-xl bg-card/80 px-3 py-2 backdrop-blur">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Poäng</p>
          <p className="text-2xl leading-none font-black text-primary">{hud.score}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const m = !muted;
              setMuted(m);
              setMutedState(m);
            }}
            className="pointer-events-auto rounded-xl bg-card/80 px-3 py-2 text-sm font-bold text-muted-foreground backdrop-blur"
            aria-label={muted ? "Slå på ljud" : "Stäng av ljud"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <div className="rounded-xl bg-card/80 px-3 py-2 text-right backdrop-blur">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              Våg {hud.wave}
            </p>
            <p className="text-sm font-bold text-accent">{hud.enemies} fiender</p>
          </div>
        </div>
      </div>

      {hud.boss && (
        <div className="pointer-events-none absolute inset-x-0 top-24 px-8">
          <div className="mx-auto max-w-sm">
            <p className="mb-1 text-center text-[10px] font-black tracking-[0.3em] text-destructive uppercase">
              Boss
            </p>
            <div className="h-4 overflow-hidden rounded-full border-2 border-destructive/60 bg-card/80">
              <div
                className="h-full bg-destructive transition-[width] duration-150"
                style={{ width: `${(hud.boss.hp / hud.boss.maxHp) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
          <p className="animate-pulse text-4xl font-black tracking-widest text-accent drop-shadow-lg">
            {hud.banner}
          </p>
        </div>
      )}

      {buffChips.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-72 flex flex-wrap justify-center gap-2 px-6">
          {buffChips.map((b) => (
            <span
              key={b.label}
              className="rounded-full bg-accent/20 px-3 py-1 text-[10px] font-black tracking-widest text-accent uppercase backdrop-blur"
            >
              {b.label} {Math.ceil(b.t)}s
            </span>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-56 px-6">
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

      {/* Character select */}
      {phase === "select" && (
        <div className="absolute inset-0 overflow-y-auto bg-background/92 px-5 py-8 backdrop-blur-sm">
          <h2 className="text-center text-3xl font-black tracking-tight text-primary">VÄLJ BRAWLER</h2>
          <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
            {BRAWLERS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setPick(b.id)}
                className={`rounded-2xl border-2 p-3 text-left transition ${
                  pick === b.id ? "border-accent bg-card" : "border-border bg-card/60"
                }`}
              >
                <span
                  className="mb-2 block size-12 rounded-full border-4 border-black/30"
                  style={{ background: b.color }}
                />
                <p className="text-base font-black text-foreground">{b.name}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{b.tagline}</p>
                <p className="mt-2 text-[10px] font-bold tracking-widest text-accent uppercase">
                  ★ {b.superName}
                </p>
                <div className="mt-2 space-y-1">
                  <Stat label="HP" v={b.hp / 180} />
                  <Stat label="FART" v={(b.speed - 180) / 150} />
                  <Stat label="DPS" v={((b.damage * b.shots) / b.cooldown) / 220} />
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => start(pick)}
            className="mx-auto mt-7 block rounded-full bg-primary px-12 py-4 text-lg font-black tracking-wide text-primary-foreground uppercase shadow-[0_8px_0_oklch(0.6_0.16_85)] transition active:translate-y-1"
          >
            Kör
          </button>
        </div>
      )}

      {/* Overlays */}
      {(phase === "menu" || phase === "over") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/85 px-8 text-center backdrop-blur-sm">
          <div>
            <h1 className="text-5xl font-black tracking-tight text-primary drop-shadow">ARENA BRAWL</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {phase === "menu"
                ? "Fyra brawlers, power-ups och boss var femte våg. Vänster spak rör dig, höger siktar och skjuter."
                : `Du föll på våg ${hud.wave}.`}
            </p>
          </div>
          {phase === "over" && (
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Poäng</p>
                <p className="text-3xl font-black text-foreground">{hud.score}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Rekord</p>
                <p className="text-3xl font-black text-accent">{best}</p>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setPhase("select");
              }}
              className="rounded-full bg-primary px-10 py-4 text-lg font-black tracking-wide text-primary-foreground uppercase shadow-[0_8px_0_oklch(0.6_0.16_85)] transition active:translate-y-1 active:shadow-[0_4px_0_oklch(0.6_0.16_85)]"
            >
              {phase === "menu" ? "Spela" : "Välj brawler"}
            </button>
            {phase === "over" && (
              <button
                type="button"
                onClick={() => start(gameRef.current.brawler.id)}
                className="rounded-full border-2 border-accent px-8 py-3 text-sm font-black tracking-wide text-accent uppercase"
              >
                Kör igen som {gameRef.current.brawler.name}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Dator: WASD för att röra dig, mellanslag för att skjuta, E för super.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[9px] font-bold tracking-wider text-muted-foreground">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.max(8, Math.min(100, v * 100))}%` }}
        />
      </span>
    </div>
  );
}
