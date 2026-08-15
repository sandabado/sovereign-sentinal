"use client";

import { motion, type Variants } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.07 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.25, 0.1, 0.25, 1] } },
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: [0.25, 0.1, 0.25, 1] }}>
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({ value, format, duration = 0.9 }: { value: number; format: (value: number) => string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [duration, value]);

  return <>{format(display)}</>;
}

export function AnimatedProgress({ value, color = "var(--purple)" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }} />
    </div>
  );
}
