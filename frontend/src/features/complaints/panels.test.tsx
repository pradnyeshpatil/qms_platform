import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Complaint } from '@/lib/types'
import { AssignModal } from './AssignModal'
import { CommentsPanel } from './CommentsPanel'

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

function stubApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) => {
    const hit = Object.keys(routes).find((k) => String(url).includes(k))
    return hit ? json(routes[hit]) : json({ code: 'not_found', message: 'Not found.', detail: 'Not found.', fields: {}, request_id: '' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/demo/complaints/1']}><Routes><Route path="/:slug/complaints/:id" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

const complaint = { id: 'c1', owner: null, assignees: [], number: 'CMP-1' } as unknown as Complaint
const comment = {
  id: 'k1', target_type: 'complaint', target_id: 'c1', body: 'Looks like a tooling issue', visibility: 'internal',
  author: 'm1', author_name: 'Dana Admin', is_edited: true, can_edit: true, edited_at: '2026-01-01T10:00:00Z', created_at: '2026-01-01T09:00:00Z',
}

describe('panels whose data loads only when opened', () => {
  it('a closed AssignModal renders nothing and does not crash while its query is disabled', () => {
    const fetchMock = stubApi({})
    renderAt(<AssignModal complaint={complaint} open={false} onOpenChange={() => {}} />)
    expect(screen.queryByText('Assign people')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled() // no wasted request until it is opened
  })

  it('the comments list renders edited comments (history modal closed) without crashing', async () => {
    stubApi({ 'comments/': { count: 1, next: null, previous: null, results: [comment] }, 'auth/me': { id: 'u', first_name: 'Dana', memberships: [] } })
    renderAt(<CommentsPanel complaintId="c1" />)
    expect(await screen.findByText('Looks like a tooling issue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'edited' })).toBeInTheDocument()
  })

  it('an empty comment list shows a friendly empty state', async () => {
    stubApi({ 'comments/': { count: 0, next: null, previous: null, results: [] } })
    renderAt(<CommentsPanel complaintId="c1" />)
    expect(await screen.findByText('No comments yet')).toBeInTheDocument()
  })
})
