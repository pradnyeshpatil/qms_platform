import type { SectionCode } from './types'

export type FieldKind = 'text' | 'textarea' | 'date' | 'number' | 'bool' | 'select' | 'member' | 'tri'
export type Field = {
  key: string; label: string; kind: FieldKind; options?: [string, string][]; hint?: string; optional?: boolean
}
export type SectionDef = {
  code: SectionCode; title: string; summary: string; required: boolean
  /** One-record sections (D0, D2, D4, D8) are edited in place; the rest are lists of rows. */
  single?: { endpoint: 'd0' | 'd2' | 'd4' | 'd8'; field: 'd0' | 'd2' | 'd4' | 'd8'; fields: Field[] }
}
export type RowDef = {
  resource: string; field: string; noun: string; code: SectionCode; titleKey: string; metaKeys?: string[]
  fields: Field[]; taskable?: boolean; empty: string
}

const bool = (key: string, label: string, hint?: string): Field => ({ key, label, kind: 'bool', hint })
const text = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, kind: 'text', ...o })
const area = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, kind: 'textarea', ...o })
const date = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, kind: 'date', optional: true, ...o })
const member = (key: string, label: string): Field => ({ key, label, kind: 'member', optional: true })

export const SECTIONS: SectionDef[] = [
  {
    code: 'D0', title: 'Prepare and plan', required: false,
    summary: 'Decide whether a formal 8D is needed and plan the response.',
    single: { endpoint: 'd0', field: 'd0', fields: [
      bool('formal_8d_required', 'A formal 8D is required'),
      area('rationale', 'Rationale', { hint: 'Required if no formal 8D is needed.', optional: true }),
      bool('emergency_response_needed', 'Emergency response needed'),
      area('emergency_actions', 'Emergency actions', { optional: true }),
      area('planned_resources', 'Planned resources', { optional: true }),
      area('notes', 'Notes', { optional: true }),
    ] },
  },
  { code: 'D1', title: 'Team', required: true, summary: 'Who works on this problem. Name a team leader.' },
  {
    code: 'D2', title: 'Describe the problem', required: true,
    summary: 'Prefilled from the complaint. State the problem precisely.',
    single: { endpoint: 'd2', field: 'd2', fields: [
      area('problem_statement', 'Problem statement', { hint: 'Required to complete this section.' }),
      area('what', 'What', { optional: true }), area('where', 'Where', { optional: true }), area('when', 'When', { optional: true }),
      text('who_detected', 'Detected by', { optional: true }), area('how_detected', 'How it was detected', { optional: true }),
      area('how_many', 'How many', { optional: true }), area('is_not_analysis', 'Is / is not analysis', { optional: true }),
      text('product_name', 'Product', { optional: true }), text('part_number', 'Part number', { optional: true }),
      text('batch_number', 'Batch / lot', { optional: true }),
      { key: 'quantity_affected', label: 'Quantity affected', kind: 'number', optional: true },
      date('detected_date', 'Detected on'),
    ] },
  },
  { code: 'D3', title: 'Interim containment', required: true, summary: 'Protect the customer until a permanent fix is in place.' },
  {
    code: 'D4', title: 'Root cause analysis', required: true,
    summary: 'Find why it happened and why it was not caught. Use 5 Whys and the fishbone as needed.',
    single: { endpoint: 'd4', field: 'd4', fields: [
      area('root_cause', 'Root cause', { hint: 'Required to complete this section.' }),
      area('occurrence_cause', 'Why it occurred', { optional: true }), area('escape_cause', 'Why it was not detected', { optional: true }),
      text('method_used', 'Method used', { optional: true }), area('verification_notes', 'How the cause was verified', { optional: true }),
      bool('root_cause_verified', 'Root cause verified'),
    ] },
  },
  { code: 'D5', title: 'Permanent corrective actions', required: true, summary: 'Propose actions and select the ones you will implement.' },
  { code: 'D6', title: 'Implement and validate', required: true, summary: 'Prove the selected actions work.' },
  { code: 'D7', title: 'Prevent recurrence', required: false, summary: 'Update systems so it cannot happen again, here or elsewhere.' },
  {
    code: 'D8', title: 'Closure and recognition', required: true, summary: 'Summarise, capture lessons and get the customer’s confirmation.',
    single: { endpoint: 'd8', field: 'd8', fields: [
      area('closure_summary', 'Closure summary', { hint: 'Required to complete this section.' }),
      area('lessons_learned', 'Lessons learned', { optional: true }), area('team_recognition', 'Team recognition', { optional: true }),
      bool('customer_confirmation', 'Customer confirmed the fix'), date('confirmation_date', 'Confirmed on'),
      area('confirmation_notes', 'Confirmation notes', { optional: true }),
    ] },
  },
]

export const ROWS: Record<string, RowDef> = {
  D1: { resource: 'team-members', field: 'team_members', noun: 'team member', code: 'D1', titleKey: 'name', metaKeys: ['role', 'department_name'], empty: 'Add the people on this team.',
    fields: [member('membership', 'Employee'), text('name', 'Name', { hint: 'Fill in for people outside the company, or leave blank when picking an employee.', optional: true }),
      text('role', 'Role', { optional: true }), text('department_name', 'Department', { optional: true }), bool('is_leader', 'Team leader'), area('responsibilities', 'Responsibilities', { optional: true })] },
  D3: { resource: 'containment-actions', field: 'containment_actions', noun: 'containment action', code: 'D3', titleKey: 'description', metaKeys: ['scope'], taskable: true, empty: 'Record what you did to protect the customer.',
    fields: [area('description', 'Action'), text('scope', 'Scope', { hint: 'Suspect stock, WIP, customer site…', optional: true }), member('responsible', 'Responsible'), date('due_date', 'Due'), date('completed_date', 'Completed'),
      { key: 'quantity_checked', label: 'Quantity checked', kind: 'number', optional: true }, { key: 'quantity_defective', label: 'Quantity defective', kind: 'number', optional: true },
      bool('effectiveness_verified', 'Effectiveness verified'), area('verification_notes', 'Verification notes', { optional: true })] },
  D5: { resource: 'corrective-actions', field: 'corrective_actions', noun: 'corrective action', code: 'D5', titleKey: 'description', metaKeys: ['kind', 'decision'], taskable: true, empty: 'Propose permanent corrective actions.',
    fields: [area('description', 'Action'), { key: 'kind', label: 'Purpose', kind: 'select', options: [['occurrence', 'Eliminates the cause'], ['escape', 'Improves detection']] },
      { key: 'decision', label: 'Decision', kind: 'select', options: [['proposed', 'Proposed'], ['selected', 'Selected'], ['rejected', 'Rejected']] },
      area('rationale', 'Rationale', { optional: true }), member('responsible', 'Responsible'), date('due_date', 'Due'), area('expected_effectiveness', 'Expected effectiveness', { optional: true })] },
  D6: { resource: 'validations', field: 'validations', noun: 'validation', code: 'D6', titleKey: 'description', metaKeys: ['results'], taskable: true, empty: 'Record how you proved the actions work.',
    fields: [area('description', 'What was validated'), member('responsible', 'Responsible'), date('implemented_date', 'Implemented'), area('validation_method', 'Method', { optional: true }),
      area('results', 'Results', { optional: true }), date('validated_date', 'Validated'), { key: 'is_effective', label: 'Effective?', kind: 'tri', optional: true }] },
  D7: { resource: 'preventive-actions', field: 'preventive_actions', noun: 'preventive action', code: 'D7', titleKey: 'description', metaKeys: ['action_type'], taskable: true, empty: 'Record the systemic changes that prevent recurrence.',
    fields: [area('description', 'Action'), { key: 'action_type', label: 'Type', kind: 'select', options: [['fmea', 'FMEA updated'], ['control_plan', 'Control plan updated'], ['procedure', 'Procedure / work instruction'], ['training', 'Training'], ['horizontal', 'Horizontal deployment'], ['other', 'Other']] },
      member('responsible', 'Responsible'), date('due_date', 'Due'), date('completed_date', 'Completed'), text('document_reference', 'Document reference', { optional: true })] },
}

/** D4's two extra lists. */
export const WHYS: RowDef = { resource: 'why-steps', field: 'why_steps', noun: 'why', code: 'D4', titleKey: 'answer', metaKeys: ['chain'], empty: 'Ask “why?” until you reach the cause.',
  fields: [{ key: 'chain', label: 'Chain', kind: 'select', options: [['occurrence', 'Why did it occur'], ['escape', 'Why was it not detected']] }, text('question', 'Question', { optional: true }), area('answer', 'Answer')] }
export const FISHBONE: RowDef = { resource: 'fishbone-causes', field: 'fishbone_causes', noun: 'cause', code: 'D4', titleKey: 'cause', metaKeys: ['category'], empty: 'List possible causes by category.',
  fields: [{ key: 'category', label: 'Category', kind: 'select', options: [['man', 'Man'], ['machine', 'Machine'], ['method', 'Method'], ['material', 'Material'], ['measurement', 'Measurement'], ['environment', 'Environment']] },
    area('cause', 'Cause'), bool('is_root_cause', 'This is the root cause')] }
