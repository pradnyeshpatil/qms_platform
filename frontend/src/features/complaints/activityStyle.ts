import {
  ArrowRightLeft, CheckCircle2, Download, FilePlus2, MessageSquare, Pencil, PlusCircle, RotateCcw, Settings2, Trash2, UserPlus,
} from 'lucide-react'
import type { ActivityKind } from '@/lib/activity'

export const KIND_STYLE: Record<ActivityKind, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  create: { icon: PlusCircle, tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
  edit: { icon: Pencil, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  status: { icon: ArrowRightLeft, tone: 'bg-violet-50 text-violet-600 ring-violet-100' },
  close: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
  reopen: { icon: RotateCcw, tone: 'bg-amber-50 text-amber-600 ring-amber-100' },
  assign: { icon: UserPlus, tone: 'bg-sky-50 text-sky-600 ring-sky-100' },
  comment: { icon: MessageSquare, tone: 'bg-indigo-50 text-indigo-600 ring-indigo-100' },
  file: { icon: FilePlus2, tone: 'bg-sky-50 text-sky-600 ring-sky-100' },
  delete: { icon: Trash2, tone: 'bg-rose-50 text-rose-600 ring-rose-100' },
  export: { icon: Download, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  settings: { icon: Settings2, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
}
