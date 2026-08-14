import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, step, type GameState, type Input } from "./engine";
import { draw } from "./render";
import { Joystick } from "./Joystick";
import { BRAWLERS } from "./characters";
import { brawlerArt, preloadSprites } from "./sprites";
import { isMuted, setMuted, unlockAudio } from "./audio";
import { activeSynergies, SYNERGIES } from "./synergy";
import {
  getSkin,
  loadSkinChoices,
  rarityColor,
  saveSkinChoice,
  skinsFor,
  SKINS,
} from "./skins";
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
  const [skinPick, setSkinPick] = useState<Record<string, string>>({});
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
    setSkinPick(loadSkinChoices());
  }, []);

  const start = useCallback((id: string, skinId?: string) => {
    unlockAudio();
    const lvl = powerLevel(profileRef.current?.brawlers[id]?.xp ?? 0);
    gameRef.current = createGame(id, lvl, skinId ?? loadSkinChoices()[id]);
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
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Poäng
          </p>
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

      {hud.synergies.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-80 flex flex-wrap justify-center gap-2 px-6">
          {hud.synergies.map((sy) => (
            <span
              key={sy.name}
              className="animate-pulse rounded-full border-2 px-3 py-1 text-[10px] font-black tracking-widest uppercase backdrop-blur"
              style={{
                color: sy.color,
                borderColor: sy.color,
                background: "oklch(0.2 0.04 265 / 70%)",
              }}
            >
              ⚡ {sy.name}
            </span>
          ))}
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
          <h2 className="text-center text-3xl font-black tracking-tight text-primary">
            VÄLJ BRAWLER
          </h2>
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
                >
                  <img
                    src={brawlerArt(b.id)}
                    alt={b.name}
                    loading="lazy"
                    width={96}
                    height={96}
                    className="size-full scale-150 object-contain object-bottom drop-shadow-lg"
                  />
                </span>
                <p className="text-base font-black text-foreground">{b.name}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{b.tagline}</p>
                <p className="mt-2 text-[10px] font-bold tracking-widest text-accent uppercase">
                  ★ {b.superName}
                </p>
                {profile && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-black">
                      <span className="text-primary">
                        NIVÅ {powerLevel(profile.brawlers[b.id]?.xp ?? 0)}
                      </span>
                      <span className="text-muted-foreground">
                        🏆 {profile.brawlers[b.id]?.trophies ?? 0}
                      </span>
                    </div>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${(() => {
                            const x = xpInLevel(profile.brawlers[b.id]?.xp ?? 0);
                            return (x.cur / x.need) * 100;
                          })()}%`,
                        }}
                      />
                    </span>
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  <Stat label="HP" v={b.hp / 180} />
                  <Stat label="FART" v={(b.speed - 180) / 150} />
                  <Stat label="DPS" v={(b.damage * b.shots) / b.cooldown / 220} />
                </div>
              </button>
            ))}
          </div>
          {(() => {
            const trophies = profile?.brawlers[pick]?.trophies ?? 0;
            const current = getSkin(skinPick[pick], pick);
            return (
              <div className="mx-auto mt-6 max-w-md">
                <p className="mb-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                  Skins · {current.name}
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {skinsFor(pick).map((sk) => {
                    const locked = trophies < sk.unlock;
                    const active = current.id === sk.id;
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          saveSkinChoice(pick, sk.id);
                          setSkinPick((p) => ({ ...p, [pick]: sk.id }));
                        }}
                        className={`min-w-28 shrink-0 rounded-2xl border-2 p-2 text-center transition ${
                          active ? "bg-card" : "bg-card/50"
                        } ${locked ? "opacity-50" : ""}`}
                        style={{ borderColor: active ? rarityColor(sk.rarity) : "var(--border)" }}
                      >
                        <span
                          className="mx-auto mb-2 block size-10 rounded-full border-4 border-black/30"
                          style={{
                            background: sk.color,
                            boxShadow: sk.aura ? `0 0 14px ${sk.aura}` : undefined,
                          }}
                        />
                        <span className="block text-[11px] font-black text-foreground">
                          {sk.name}
                        </span>
                        <span
                          className="block text-[9px] font-bold tracking-widest uppercase"
                          style={{ color: rarityColor(sk.rarity) }}
                        >
                          {sk.rarity}
                        </span>
                        {locked && (
                          <span className="mt-1 block text-[9px] font-bold text-muted-foreground">
                            🔒 {sk.unlock} 🏆
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => start(pick, skinPick[pick])}
            className="mx-auto mt-7 block rounded-full bg-primary px-12 py-4 text-lg font-black tracking-wide text-primary-foreground uppercase shadow-[0_8px_0_oklch(0.6_0.16_85)] transition active:translate-y-1"
          >
            Kör
          </button>
        </div>
      )}

      {/* Ranks & season */}
      {phase === "ranks" && profile && (
        <div className="absolute inset-0 overflow-y-auto bg-background/95 px-5 py-8 backdrop-blur">
          <h2 className="text-center text-3xl font-black tracking-tight text-primary">RANKING</h2>
          <div className="mx-auto mt-6 max-w-md space-y-5">
            <RankCard profile={profile} />
            <div>
              <p className="mb-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                Troféer per brawler
              </p>
              <div className="space-y-2">
                {[...BRAWLERS]
                  .sort(
                    (a, c) =>
                      (profile.brawlers[c.id]?.trophies ?? 0) -
                      (profile.brawlers[a.id]?.trophies ?? 0),
                  )
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3"
                    >
                      <span
                        className="size-8 rounded-full border-2 border-black/40"
                        style={{ background: b.color }}
                      />
                      <span className="flex-1 text-sm font-black text-foreground">{b.name}</span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        NIVÅ {powerLevel(profile.brawlers[b.id]?.xp ?? 0)}
                      </span>
                      <span className="text-sm font-black text-primary">
                        🏆 {profile.brawlers[b.id]?.trophies ?? 0}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                Kosmetika ·{" "}
                {
                  SKINS.filter((s) => (profile.brawlers[s.brawlerId]?.trophies ?? 0) >= s.unlock)
                    .length
                }
                /{SKINS.length} skins
              </p>
              <div className="mb-5 grid grid-cols-2 gap-2">
                {SKINS.map((sk) => {
                  const locked = (profile.brawlers[sk.brawlerId]?.trophies ?? 0) < sk.unlock;
                  return (
                    <div
                      key={sk.id}
                      className={`flex items-center gap-2 rounded-xl border bg-card/70 p-2 ${locked ? "opacity-45" : ""}`}
                      style={{ borderColor: rarityColor(sk.rarity) }}
                    >
                      <span
                        className="size-6 shrink-0 rounded-full border-2 border-black/40"
                        style={{ background: sk.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-black text-foreground">
                          {sk.name}
                        </span>
                        <span
                          className="block text-[9px] font-bold tracking-widest uppercase"
                          style={{ color: rarityColor(sk.rarity) }}
                        >
                          {locked ? `🔒 ${sk.unlock} 🏆` : sk.rarity}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mb-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                Power-up-synergier
              </p>
              <div className="space-y-2">
                {SYNERGIES.map((sy) => (
                  <div key={sy.id} className="rounded-xl border border-border bg-card/70 p-3">
                    <p className="text-xs font-black uppercase" style={{ color: sy.color }}>
                      {sy.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{sy.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            {profile.history.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                  Tidigare säsonger
                </p>
                {profile.history.map((h) => (
                  <div
                    key={h.season}
                    className="flex justify-between rounded-xl border border-border bg-card/70 px-3 py-2 text-xs font-bold"
                  >
                    <span className="text-muted-foreground">Säsong {h.season}</span>
                    <span className="text-foreground">
                      {h.rank} · 🏆 {h.trophies}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setPhase("menu")}
              className="mx-auto block rounded-full border-2 border-accent px-8 py-3 text-sm font-black tracking-wide text-accent uppercase"
            >
              Tillbaka
            </button>
          </div>
        </div>
      )}

      {/* Overlays */}
      {(phase === "menu" || phase === "over") && (
        <div className="absolute inset-0 overflow-y-auto bg-background/90 px-6 py-10 text-center backdrop-blur-sm">
          <div className="mx-auto flex max-w-md flex-col items-center gap-5">
            <div>
              <h1 className="text-5xl font-black tracking-tight text-primary drop-shadow">
                ARENA BRAWL
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {phase === "menu"
                  ? "Fyra brawlers, power-up-synergier och boss var femte våg. Klättra i rank innan säsongen tar slut."
                  : `Du föll på våg ${hud.wave}.`}
              </p>
            </div>

            {profile && <RankCard profile={profile} />}

            {phase === "over" && result && (
              <div className="w-full rounded-2xl border-2 border-accent/50 bg-card/80 p-4">
                <div className="flex justify-around">
                  <Metric label="Poäng" value={String(result.score)} />
                  <Metric label="XP" value={`+${result.xp}`} />
                  <Metric
                    label="Troféer"
                    value={`${result.trophies >= 0 ? "+" : ""}${result.trophies}`}
                  />
                </div>
                {result.levelUp && (
                  <p className="mt-3 text-sm font-black tracking-widest text-primary uppercase">
                    ★ Nivå {result.newLevel} upplåst!
                  </p>
                )}
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
                  onClick={() => start(gameRef.current.brawler.id, gameRef.current.skin.id)}
                  className="rounded-full border-2 border-accent px-8 py-3 text-sm font-black tracking-wide text-accent uppercase"
                >
                  Kör igen som {gameRef.current.brawler.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPhase("ranks")}
                className="text-xs font-black tracking-widest text-muted-foreground uppercase underline"
              >
                Ranking & säsong
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Dator: WASD för att röra dig, mellanslag för att skjuta, E för super.
            </p>
          </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}

function RankCard({ profile }: { profile: Profile }) {
  const total = totalTrophies(profile);
  const rank = rankFor(total);
  return (
    <div className="w-full rounded-2xl border-2 border-border bg-card/80 p-4 text-left">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Rank
          </p>
          <p className="text-2xl font-black" style={{ color: rank.color }}>
            {rank.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Troféer
          </p>
          <p className="text-2xl font-black text-primary">🏆 {total}</p>
        </div>
      </div>
      <span className="mt-3 block h-2 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.round(rank.progress * 100)}%`, background: rank.color }}
        />
      </span>
      <p className="mt-2 flex justify-between text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        <span>{rank.next ? `${rank.next.min - total} till ${rank.next.name}` : "Maxrank"}</span>
        <span>
          Säsong {profile.season} · {seasonDaysLeft(profile)} d kvar
        </span>
      </p>
    </div>
  );
}
