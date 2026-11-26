import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { CATEGORY_STYLE } from '@/components/kit/theme'
import type { WorkflowStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Where the complaint is in the workflow: finished steps filled, current step glowing. Display only. */
export function StatusStepper({ statuses, currentId }: { statuses: WorkflowStatus[]; currentId: string }) {
  const steps = statuses.filter((s) => s.is_active || s.id === currentId).sort((a, b) => a.sort_order - b.sort_order)
  const current = Math.max(0, steps.findIndex((s) => s.id === currentId))
  if (steps.length < 2) return null
  return (
    <ol className="scroll-thin flex items-start overflow-x-auto pb-1" aria-label="Workflow progress">
      {steps.map((s, i) => {
        const done = i < current, active = i === current
        const tone = CATEGORY_STYLE[s.category]
        return (
          <li key={s.id} className="relative flex min-w-[96px] flex-1 flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
            {i > 0 && (
              <span className="absolute right-1/2 top-[13px] h-0.5 w-full -translate-y-1/2 bg-slate-200" aria-hidden>
                <motion.span className="block h-full origin-left bg-indigo-500" initial={{ scaleX: 0 }} animate={{ scaleX: i <= current ? 1 : 0 }} transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }} />
              </span>
            )}
            <span className="relative z-10 flex h-7 w-7 items-center justify-center">
              {active && <span className={cn('absolute inset-0 animate-[var(--animate-pulse-ring)] rounded-full', tone.dot, 'opacity-40')} aria-hidden />}
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 22 }}
                className={cn('relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ring-4 ring-white', done && 'bg-indigo-500 text-white', active && cn(tone.dot, 'text-white'), !done && !active && 'bg-slate-200 text-slate-500')}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </motion.span>
            </span>
            <span className={cn('mt-2 px-1 text-xs leading-tight', active ? 'font-semibold text-slate-900' : done ? 'text-slate-600' : 'text-slate-400')}>{s.name}</span>
          </li>
        )
      })}
    </ol>
  )
}
