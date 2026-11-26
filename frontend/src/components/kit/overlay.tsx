import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

type Common = { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }

const overlayMotion = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

function Shell({ open, onOpenChange, title, description, children, footer, side }: Common & { side: 'right' | 'center' }) {
  const panel =
    side === 'right'
      ? { className: 'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-[var(--shadow-pop)] sm:rounded-l-3xl', initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }
      : { className: 'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-white shadow-[var(--shadow-pop)]', initial: { opacity: 0, scale: 0.96, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 4 } }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px]" {...overlayMotion} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={panel.className}
                initial={panel.initial} animate={panel.animate} exit={panel.exit}
                transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                  <div className="min-w-0">
                    <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
                    {description ? <Dialog.Description className="mt-0.5 text-sm text-slate-500">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
                  </div>
                  <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button></Dialog.Close>
                </div>
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:rounded-b-3xl">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

/** Slide-over panel for create / edit forms. */
export const Drawer = (p: Common) => <Shell {...p} side="right" />
/** Centered dialog for short decisions. */
export const Modal = (p: Common) => <Shell {...p} side="center" />

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', danger, loading, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void
}) {
  return (
    <Modal
      open={open} onOpenChange={onOpenChange} title={title}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}
    >
      <p className={cn('text-sm leading-relaxed text-slate-600')}>{description}</p>
    </Modal>
  )
}
