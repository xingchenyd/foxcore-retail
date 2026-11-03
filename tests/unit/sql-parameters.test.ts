import { describe, expect, it } from 'vitest';
import { bind } from '../../apps/server/src/sql-parameters.js';

describe('PostgreSQL bind markers', () => {
  it('leaves quoted strings, identifiers and casts intact', () => {
    expect(bind("SELECT '?','a''?b',\"what?\", ?::bigint", 1)).toBe("SELECT '?','a''?b',\"what?\", $1::bigint");
  });
  it('leaves escaped strings, dollar quotes and nested comments intact', () => {
    const prefix = "SELECT E'can\\'t?', $tag$?$tag$, /* ? /* ? */ ? */ -- ?\n";
    expect(bind(prefix + '?, ?', 2)).toBe(prefix + '$1, $2');
  });
  it('binds parameters in order beyond nine and rejects a count mismatch', () => {
    expect(bind('?,?,?,?,?,?,?,?,?,?,?,?', 12)).toBe('$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12');
    expect(() => bind("SELECT '?', ?", 2)).toThrow('SQL bind parameter count mismatch');
  });
});
