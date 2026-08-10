import { useCallback, useRef, useState } from "react";

type Props = {
  onChange: (x: number, y: number) => void;
  onRelease?: () => void;
  label: string;
  variant?: "move" | "shoot";
};

export function Joystick({ onChange, onRelease, label, variant = "move" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = r.width / 2;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      setKnob({ x: dx, y: dy });
      onChange(dx / max, dy / max);
    },
    [onChange],
  );

  return (
    <div
      ref={ref}
      aria-label={label}
      className={`relative size-32 touch-none rounded-full border-2 backdrop-blur-sm select-none ${
        variant === "shoot"
          ? "border-accent/60 bg-accent/15"
          : "border-primary/50 bg-secondary/40"
      }`}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e);
      }}
      onPointerUp={(e) => {
        if (pointer.current !== e.pointerId) return;
        pointer.current = null;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
        onRelease?.();
      }}
      onPointerCancel={() => {
        pointer.current = null;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
        onRelease?.();
      }}
    >
      <div
        className={`pointer-events-none absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg ${
          variant === "shoot" ? "bg-accent" : "bg-primary"
        }`}
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
      <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}