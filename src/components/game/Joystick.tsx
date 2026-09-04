import { useCallback, useRef, useState } from "react";

type Props = {
  onChange: (x: number, y: number) => void;
  onPress?: () => void;
  onRelease?: () => void;
  label: string;
  variant?: "move" | "shoot";
  /** Fraction of the pad radius ignored before the stick responds. */
  deadzone?: number;
};

export function Joystick({
  onChange,
  onPress,
  onRelease,
  label,
  variant = "move",
  deadzone = 0.16,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  /** Origin of the current drag: the stick re-centres where the finger lands. */
  const origin = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const update = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const max = r.width / 2;
      let dx = e.clientX - origin.current.x;
      let dy = e.clientY - origin.current.y;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      setKnob({ x: dx, y: dy });

      const mag = Math.min(1, len / max);
      if (mag <= deadzone) {
        onChange(0, 0);
        return;
      }
      // Remap past the deadzone and ease slightly for finer control near centre.
      const t = (mag - deadzone) / (1 - deadzone);
      const out = t * t * 0.35 + t * 0.65;
      onChange((dx / (len || 1)) * out, (dy / (len || 1)) * out);
    },
    [onChange, deadzone],
  );

  const end = useCallback(() => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    setActive(false);
    onChange(0, 0);
    onRelease?.();
  }, [onChange, onRelease]);

  return (
    <div
      ref={ref}
      aria-label={label}
      className={`relative size-32 touch-none rounded-full border-2 backdrop-blur-sm transition-colors select-none ${
        variant === "shoot"
          ? `border-accent/60 ${active ? "bg-accent/30" : "bg-accent/15"}`
          : `border-primary/50 ${active ? "bg-secondary/70" : "bg-secondary/40"}`
      }`}
      style={{ padding: 18, margin: -18, boxSizing: "content-box" }}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const max = r.width / 2;
        // Anchor the drag at the finger, but never further than half a radius
        // from the centre so the stick keeps its full range.
        let ox = e.clientX - cx;
        let oy = e.clientY - cy;
        const l = Math.hypot(ox, oy);
        if (l > max * 0.5) {
          ox = (ox / l) * max * 0.5;
          oy = (oy / l) * max * 0.5;
        }
        origin.current = { x: cx + ox, y: cy + oy };
        setActive(true);
        onPress?.();
        update(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e);
      }}
      onPointerUp={(e) => {
        if (pointer.current === e.pointerId) end();
      }}
      onPointerCancel={() => end()}
      onLostPointerCapture={() => {
        if (pointer.current !== null) end();
      }}
    >
      <div className="relative size-32">
        <div
          className={`pointer-events-none absolute top-1/2 left-1/2 size-14 rounded-full shadow-lg ${
            variant === "shoot" ? "bg-accent" : "bg-primary"
          }`}
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
        <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
