import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Menu({ trigger, children, align = 'end' }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align} sideOffset={8}
          className="z-50 min-w-52 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-[var(--shadow-pop)] data-[state=open]:animate-[var(--animate-rise)]"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const itemClass = (danger?: boolean) => cn('flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none transition-colors data-[disabled]:opacity-40', danger ? 'text-rose-600 data-[highlighted]:bg-rose-50' : 'text-slate-700 data-[highlighted]:bg-slate-100')

export function MenuItem({ icon, children, danger, onSelect, disabled }: { icon?: React.ReactNode; children: React.ReactNode; danger?: boolean; onSelect?: () => void; disabled?: boolean }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} disabled={disabled} className={itemClass(danger)}>
      {icon && <span className="text-slate-400" aria-hidden>{icon}</span>}
      {children}
    </DropdownMenu.Item>
  )
}

/** A menu entry that is a real link (e.g. a file download), so middle-click / copy-link keep working. */
export function MenuLink({ href, icon, children, download }: { href: string; icon?: React.ReactNode; children: React.ReactNode; download?: boolean }) {
  return (
    <DropdownMenu.Item asChild className={itemClass()}>
      <a href={href} download={download}>
        {icon && <span className="text-slate-400" aria-hidden>{icon}</span>}
        {children}
      </a>
    </DropdownMenu.Item>
  )
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1.5 h-px bg-slate-100" />
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <DropdownMenu.Label className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{children}</DropdownMenu.Label>
