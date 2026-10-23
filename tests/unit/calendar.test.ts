import { describe, expect, it } from 'vitest';
import { parseCalendarDate } from '../../apps/server/src/fix-rules.js';

describe('calendar dates accepted by activity creation', () => {
  it.each(['2026-10-24', '2024-02-29', '2000-02-29', '1000-01-01', '9999-12-31'])('preserves valid date %s', value => {
    expect(parseCalendarDate(value)).toBe(value);
  });

  it.each(['2026-02-29', '2026-02-30', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '0000-01-01', '0999-12-31', '2026-1-01', '2026-10-24T00:00:00Z', '', null, 20261024])('rejects invalid date %s with a client error', value => {
    expect(() => parseCalendarDate(value)).toThrow(expect.objectContaining({ status: 400, code: 'BAD_REQUEST' }));
  });
});
