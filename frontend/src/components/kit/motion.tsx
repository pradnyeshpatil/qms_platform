import { animate, motion, useReducedMotion } from 'motion/react'
import * as React from 'react'

/** Number that counts up to its value (instant under reduced-motion). */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = React.useState(reduce ? value : 0)
  React.useEffect(() => {
    if (reduce) { setShown(value); return }
    const controls = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(Math.round(v)) })
    return () => controls.stop()
  }, [value, reduce])
  return <span className={className} aria-label={String(value)}>{shown.toLocaleString()}</span>
}

/** Fades + lifts its children in; stagger by passing `index`. */
export function Reveal({ index = 0, className, children, as = 'div' }: { index?: number; className?: string; children: React.ReactNode; as?: 'div' | 'li' | 'section' }) {
  const M = motion[as]
  return (
    <M className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: Math.min(index, 12) * 0.045, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </M>
  )
}

/** Page-level fade/slide on route change. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  )
}
