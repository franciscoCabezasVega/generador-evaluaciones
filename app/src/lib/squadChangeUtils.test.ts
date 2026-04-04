import { normalizeNumber, detectSquadChanges } from '@/lib/squadChangeUtils';

describe('normalizeNumber', () => {
  it('returns 0 for null', () => expect(normalizeNumber(null)).toBe(0));
  it('returns 0 for undefined', () => expect(normalizeNumber(undefined)).toBe(0));
  it('returns 0 for NaN-producing strings', () => expect(normalizeNumber('abc')).toBe(0));
  it('converts numeric strings to numbers', () => expect(normalizeNumber('5')).toBe(5));
  it('passes through valid numbers', () => expect(normalizeNumber(7)).toBe(7));
  it('handles zero correctly', () => expect(normalizeNumber(0)).toBe(0));
  it('handles negative numbers', () => expect(normalizeNumber(-3)).toBe(-3));
});

describe('detectSquadChanges', () => {
  const makeSquad = (
    squad: string,
    low = 0,
    medium = 0,
    high = 0,
    notes = '',
  ) => ({ squad, low_returns: low, medium_returns: medium, high_returns: high, additional_notes: notes });

  it('returns empty array when nothing changes', () => {
    const squads = [makeSquad('Alpha', 1, 2, 0)];
    expect(detectSquadChanges(squads, squads)).toHaveLength(0);
  });

  it('detects a change in low_returns', () => {
    const old = [makeSquad('Alpha', 0, 0, 0)];
    const next = [makeSquad('Alpha', 5, 0, 0)];
    const changes = detectSquadChanges(old, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].squad).toBe('Alpha');
    expect(changes[0].low).toEqual({ old: 0, new: 5 });
  });

  it('detects a change in additional_notes', () => {
    const old = [makeSquad('Beta', 0, 0, 0, '')];
    const next = [makeSquad('Beta', 0, 0, 0, 'new note')];
    const changes = detectSquadChanges(old, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].additional_notes).toEqual({ old: '', new: 'new note' });
  });

  it('detects a newly added squad', () => {
    const old: ReturnType<typeof makeSquad>[] = [];
    const next = [makeSquad('Gamma', 2, 1, 0)];
    const changes = detectSquadChanges(old, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].squad).toBe('Gamma');
    expect(changes[0].low.old).toBe(0);
    expect(changes[0].low.new).toBe(2);
  });

  it('detects a removed squad (squad disappears → new values are 0)', () => {
    const old = [makeSquad('Delta', 3, 2, 1)];
    const next: ReturnType<typeof makeSquad>[] = [];
    const changes = detectSquadChanges(old, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].squad).toBe('Delta');
    expect(changes[0].low.new).toBe(0);
    expect(changes[0].high.new).toBe(0);
  });

  it('returns empty array for non-array inputs', () => {
    expect(detectSquadChanges(null, null)).toHaveLength(0);
    expect(detectSquadChanges(undefined, undefined)).toHaveLength(0);
    expect(detectSquadChanges({}, {})).toHaveLength(0);
  });

  it('handles multiple squads with mixed changes', () => {
    const old = [makeSquad('A', 1, 0, 0), makeSquad('B', 0, 0, 0)];
    const next = [makeSquad('A', 1, 0, 0), makeSquad('B', 2, 0, 0)];
    const changes = detectSquadChanges(old, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].squad).toBe('B');
  });
});
