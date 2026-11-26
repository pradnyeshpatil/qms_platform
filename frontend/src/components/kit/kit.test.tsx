import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { StatusStepper } from '@/features/complaints/StatusStepper'
import type { WorkflowStatus } from '@/lib/types'
import { FormField } from './inputs'
import { Menu, MenuItem, MenuLink } from './menu'
import { Segmented } from './segmented'
import { SeverityPill, StatusPill } from './pills'

const status = (id: string, name: string, sort_order: number, category: WorkflowStatus['category'] = 'open', is_active = true): WorkflowStatus => ({
  id, name, category, system_key: id, is_default: false, is_active, sort_order, is_finished: false, allowed_next: [],
})

describe('Segmented', () => {
  it('exposes a radio group and switches the selection on click', async () => {
    function Demo() {
      const [v, setV] = useState('all')
      return <Segmented label="Show" value={v} onChange={setV} options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open', count: 3 }]} />
    }
    render(<Demo />)
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /All/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Open/ }))
    expect(screen.getByRole('radio', { name: /Open/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /All/ })).not.toBeChecked()
  })
})

describe('StatusStepper', () => {
  it('orders active steps, marks the current one, and hides inactive ones', () => {
    const list = [status('b', 'Investigating', 20, 'in_progress'), status('a', 'New', 10), status('x', 'Retired', 15, 'open', false), status('c', 'Closed', 30, 'closed')]
    render(<StatusStepper statuses={list} currentId="b" />)
    const steps = screen.getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual(['New', '2Investigating', '3Closed']) // finished steps show a check, not a number
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByText('Retired')).not.toBeInTheDocument()
  })
  it('keeps an inactive status visible when a complaint is still on it', () => {
    render(<StatusStepper statuses={[status('a', 'New', 1), status('x', 'Legacy', 2, 'open', false), status('c', 'Closed', 3, 'closed')]} currentId="x" />)
    expect(screen.getByText('Legacy')).toBeInTheDocument()
  })
})

describe('pills and fields', () => {
  it('render their text', () => {
    render(<><StatusPill name="Under Investigation" category="in_progress" /><SeverityPill severity="critical" /></>)
    expect(screen.getByText('Under Investigation')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })
  it('FormField links the label to the control and announces errors', () => {
    render(<FormField label="Title" htmlFor="t" error="Give it a title"><input id="t" /></FormField>)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a title')
  })
})

describe('Menu', () => {
  it('opens and exposes real download links alongside normal items', async () => {
    render(
      <Menu trigger={<button type="button">Export</button>}>
        <MenuLink href="/api/export?export_format=xlsx" download icon={<span data-testid="icon" />}>Excel file</MenuLink>
        <MenuItem onSelect={() => {}}>Something else</MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    const link = await screen.findByRole('menuitem', { name: 'Excel file' })
    expect(link).toHaveAttribute('href', '/api/export?export_format=xlsx')
    expect(link).toHaveAttribute('download')
    expect(screen.getByRole('menuitem', { name: 'Something else' })).toBeInTheDocument()
  })
})
