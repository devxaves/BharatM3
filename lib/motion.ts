/**
 * Shared motion config (PRD §8.2) — every animation in the app draws from these tokens.
 * Durations stay within 150–250 ms; one easing curve everywhere.
 */
export const EASE = [0.2, 0, 0, 1] as const;
export const DUR = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

export const transition = { duration: DUR.base, ease: EASE };
export const fastTransition = { duration: DUR.fast, ease: EASE };

export const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition },
  exit: { opacity: 0, y: -4, transition: fastTransition },
};

export const rowEnter = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: fastTransition },
  exit: { opacity: 0, transition: fastTransition },
};

/** Staggered reveal used by the match-review attribute diff ("the explanation is shown, not dumped"). */
export const staggerParent = { animate: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } } };
export const staggerChild = {
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0, transition },
};

export const expand = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: DUR.slow, ease: EASE } },
  exit: { height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE } },
};
