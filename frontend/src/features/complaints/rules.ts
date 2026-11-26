import { fileSize } from '@/lib/format'
import type { WorkflowStatus } from '@/lib/types'

/** Why a target status can't be chosen right now (or null if it can). Pure, so it is unit-tested. */
export function blockedReason(current: WorkflowStatus, target: WorkflowStatus, canClose: boolean): string | null {
  if (target.id === current.id) return null
  if (current.allowed_next.length > 0 && !current.allowed_next.includes(target.id)) return `Not allowed after “${current.name}”`
  const reopening = current.is_finished && !target.is_finished
  if ((target.is_finished || reopening) && !canClose) return reopening ? 'You can’t reopen complaints' : 'You can’t resolve or close complaints'
  return null
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'csv', 'txt']

/** Quick browser-side check so people get instant feedback; the server re-validates content. */
export function checkFile(file: { name: string; size: number }): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (!ALLOWED_EXT.includes(ext)) return `“.${ext || '?'}” files aren’t allowed`
  if (file.size === 0) return 'The file is empty'
  if (file.size > MAX_FILE_BYTES) return `Larger than ${MAX_FILE_BYTES / 1024 / 1024} MB (${fileSize(file.size)})`
  return null
}
