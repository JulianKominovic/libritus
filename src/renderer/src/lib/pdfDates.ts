/** Coerce a persisted PDF date (ISO string or Date) back to a `Date | null`. */
export function parsePdfDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' && value.trim() !== '') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}
