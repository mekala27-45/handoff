import { createHash } from 'node:crypto';

export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error('ambiguous_number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('unsupported_canonical_value');
}
export const digest = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
