import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import { avatarTone } from './theme'

export function Avatar({ name, size = 'md', className }: { name: string | null | undefined; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { xs: 'h-6 w-6 text-[10px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white', sizes[size], avatarTone(name ?? '?'), className)}
      title={name ?? undefined}
      aria-hidden={name ? undefined : true}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max)
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((n) => <Avatar key={n} name={n} size="sm" />)}
      {names.length > max && <span className="z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600 ring-2 ring-white">+{names.length - max}</span>}
    </span>
  )
}
