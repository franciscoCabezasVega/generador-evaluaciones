/**
 * Unit tests for authStorage — localStorage caching utilities.
 *
 * localStorage is mocked via jest-environment-jsdom built-in Storage mock.
 */
import {
  getFromLocalStorage,
  saveToLocalStorage,
  clearLocalStorage,
} from '@/contexts/authStorage';
import type { UserProfile } from '@/lib/types';

const mockProfile: UserProfile = {
  id: 'user-123',
  email: 'user@test.com',
  role: 'gestor',
  role_id: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const STORAGE_KEY = 'auth_user_profile';
const STORAGE_EXPIRY = 'auth_user_profile_expiry';

describe('saveToLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('persists the profile as JSON', () => {
    saveToLocalStorage(mockProfile);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(mockProfile);
  });

  it('sets an expiry timestamp in the future', () => {
    const before = Date.now();
    saveToLocalStorage(mockProfile);
    const expiry = Number(localStorage.getItem(STORAGE_EXPIRY));
    expect(expiry).toBeGreaterThan(before);
  });
});

describe('getFromLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when localStorage is empty', () => {
    expect(getFromLocalStorage()).toBeNull();
  });

  it('returns the profile when cache is still valid', () => {
    saveToLocalStorage(mockProfile);
    expect(getFromLocalStorage()).toEqual(mockProfile);
  });

  it('returns null and clears storage when cache has expired', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockProfile));
    // Expiry set to the past
    localStorage.setItem(STORAGE_EXPIRY, (Date.now() - 1000).toString());

    expect(getFromLocalStorage()).toBeNull();
    // Should have been cleared
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json');
    localStorage.setItem(STORAGE_EXPIRY, (Date.now() + 999999).toString());
    expect(getFromLocalStorage()).toBeNull();
  });
});

describe('clearLocalStorage', () => {
  beforeEach(() => {
    saveToLocalStorage(mockProfile);
  });

  it('removes both the profile and expiry keys', () => {
    clearLocalStorage();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_EXPIRY)).toBeNull();
  });
});
