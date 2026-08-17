import { useCallback, useEffect, useRef, useState } from "react";
import logo from "@/assets/velnox.ia_logo.png";

// Mosaic tiles that assemble behind the logo, then fly outward when the
// intro exits. Positions/sizes are arbitrary — colors alternate between two
// near-black tones so the seams read as a deliberate grid, not noise.
const MOSAIC_DEF: [number, number, number, number, number][] = [
  [0, 0, 30, 18, 0], [0, 18, 30, 20, 1], [30, 0, 20, 38, 0],
  [50, 0, 22, 38, 1], [72, 0, 14, 38, 0], [86, 0, 14, 38, 1],
  [0, 38, 30, 20, 1], [30, 38, 20, 20, 0], [50, 38, 22, 10, 1],
  [50, 48, 22, 10, 0], [72, 38, 28, 20, 1], [0, 58, 30, 20, 0],
  [0, 78, 30, 22, 1], [30, 58, 20, 22, 0], [30, 80, 20, 20, 1],
  [50, 58, 10, 42, 0], [60, 58, 12, 42, 1], [72, 58, 28, 42, 0],
];
const TILE_COLORS = ["#0a0a0a", "#121212"];
const MOSAIC_BLOCKS = MOSAIC_DEF.map(([l, t, w, h, ci]) => {
  const cx = l + w / 2;
  const cy = t + h / 2;
  const dx = cx - 50;
  const dy = cy - 50;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    l, t, w, h,
    color: TILE_COLORS[ci],
    exitX: (dx / dist) * 165,
    exitY: (dy / dist) * 165,
    delay: Math.round((dist / 70) * 260),
  };
});

export function IntroScreen({ onDone, duration = 2200 }: { onDone: () => void; duration?: number }) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  const [exploding, setExploding] = useState(false);
  const [gone, setGone] = useState(false);
  const called = useRef(false);

  const doExit = useCallback(() => {
    if (called.current) return;
    called.current = true;
    setPhase(3);
    setTimeout(() => {
      setExploding(true);
      onDone();
    }, 150);
    setTimeout(() => setGone(true), 1300);
  }, [onDone]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      setGone(true);
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 450);
    const t2 = setTimeout(() => setPhase(2), 1000);
    const t3 = setTimeout(() => doExit(), duration);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  if (gone) return null;

  const logoIn = phase >= 1;
  const logoFloat = phase === 2;
  const logoOut = phase >= 3;

  return (
    <div
      role="presentation"
      onClick={doExit}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        background: exploding ? "transparent" : "#050505",
        pointerEvents: phase >= 3 ? "none" : "auto",
        cursor: "pointer",
      }}
    >
      {MOSAIC_BLOCKS.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${b.l}%`,
            top: `${b.t}%`,
            width: `calc(${b.w}% + 1px)`,
            height: `calc(${b.h}% + 1px)`,
            background: b.color,
            transform: exploding
              ? `translate(${b.exitX}vw, ${b.exitY}vh) scale(1.04)`
              : "translate(0, 0)",
            transition: exploding
              ? `transform 0.85s cubic-bezier(0.55,0,1,0.45) ${b.delay}ms`
              : "none",
            willChange: "transform",
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 5,
          pointerEvents: "none",
          opacity: logoOut ? 0 : phase >= 1 ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "620px",
            height: "620px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, var(--color-primary-glow, var(--primary)) 0%, transparent 70%)",
            opacity: 0.16,
            transform: "translate(-50%, -50%)",
            filter: "blur(30px)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 1.5rem",
          pointerEvents: "none",
        }}
      >
        <img
          src={logo}
          alt="velnox.ia"
          style={{
            height: "72px",
            width: "auto",
            opacity: logoOut ? 0 : logoIn ? 1 : 0,
            transform: logoOut
              ? "translateY(-10px) scale(0.94)"
              : logoIn
                ? "translateY(0) scale(1)"
                : "translateY(24px) scale(0.9)",
            transition: logoOut
              ? "opacity 0.25s ease, transform 0.25s ease"
              : "opacity 0.6s cubic-bezier(0.34,1.4,0.64,1), transform 0.6s cubic-bezier(0.34,1.4,0.64,1)",
            animation: logoFloat ? "float 3s ease-in-out infinite" : "none",
            filter: logoIn && !logoOut ? "drop-shadow(0 0 26px color-mix(in oklab, var(--primary) 55%, transparent))" : "none",
          }}
        />
      </div>
    </div>
  );
}
