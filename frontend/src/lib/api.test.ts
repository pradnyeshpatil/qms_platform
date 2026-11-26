import { describe, expect, it } from 'vitest'
import { ApiError, qs } from './api'

describe('ApiError', () => {
  it('reads the uniform envelope: message, code, request id and per-field errors', () => {
    const e = new ApiError(400, {
      code: 'validation_error', message: 'Please correct the highlighted fields.', detail: 'x',
      fields: { title: ['Required'], customer: ['Choose one', 'second'] }, request_id: 'req-1',
    })
    expect(e.message).toBe('Please correct the highlighted fields.')
    expect(e.code).toBe('validation_error')
    expect(e.requestId).toBe('req-1')
    expect(e.fieldErrors).toEqual({ title: 'Required', customer: 'Choose one' })
    expect(e.isFieldValidation).toBe(true)
  })

  it('has no field errors for service-level errors (message only)', () => {
    const e = new ApiError(400, { code: 'validation_error', message: 'The default status cannot be deleted.', detail: 'x', fields: {}, request_id: '' })
    expect(e.fieldErrors).toEqual({})
    expect(e.isFieldValidation).toBe(false)
    expect(e.message).toBe('The default status cannot be deleted.')
  })

  it('keeps the code of permission errors so the UI can react (e.g. password_change_required)', () => {
    const e = new ApiError(403, { code: 'password_change_required', message: 'You must change your password first.', detail: 'x', fields: {}, request_id: '' })
    expect(e.code).toBe('password_change_required')
  })

  it('still understands the pre-envelope shapes', () => {
    expect(new ApiError(400, { email: ['Enter a valid email'] }).fieldErrors).toEqual({ email: 'Enter a valid email' })
    expect(new ApiError(404, { detail: 'Not found.' }).message).toBe('Not found.')
    expect(new ApiError(500, null).message).toBe('Request failed (500)')
  })
})

describe('qs', () => {
  it('drops empty values and encodes the rest', () => {
    expect(qs({ a: 'x y', b: '', c: undefined, d: null, e: false, f: true, g: 2 })).toBe('?a=x+y&f=true&g=2')
    expect(qs({})).toBe('')
  })
})
