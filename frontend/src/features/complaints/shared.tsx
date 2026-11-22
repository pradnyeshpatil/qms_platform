import { Badge } from '@/components/ui/misc'
import { STATUS_LABEL, type ComplaintStatus, type Severity } from '@/lib/types'

export const SeverityBadge = ({ s }: { s: Severity }) => (
  <Badge tone={s === 'critical' ? 'red' : s === 'major' ? 'amber' : 'gray'}>{s}</Badge>
)
export const StatusBadge = ({ s }: { s: ComplaintStatus }) => (
  <Badge tone={s === 'new' ? 'blue' : s === 'under_investigation' ? 'amber' : s === 'resolved' ? 'green' : 'gray'}>{STATUS_LABEL[s]}</Badge>
)
