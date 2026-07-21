"use client";

import { animate, motion } from "framer-motion";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/lib/finance";

/** Dollar amount that counts up/down over ~800ms whenever it changes. */
export function AnimatedMoney({
  value,
  cents = false,
  className,
}: {
  value: number;
  cents?: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  const rounded = cents ? Math.round(display * 100) / 100 : Math.round(display);
  return <span className={className}>{fmt(rounded, cents)}</span>;
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

/** Fades+slides children in on mount, staggered 50ms apart. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={`${className ?? ""} [&>div:empty]:hidden`}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      {Children.map(children, (c, i) =>
        c == null ? null : (
          <motion.div key={i} variants={itemVariants}>
            {c}
          </motion.div>
        )
      )}
    </motion.div>
  );
}
