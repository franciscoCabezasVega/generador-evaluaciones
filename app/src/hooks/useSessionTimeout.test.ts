/**
 * Unit tests for useSessionTimeout.
 *
 * Tests the inactivity timer logic using fake timers.
 * authService is mocked to avoid Supabase dependencies.
 */
import { act, renderHook } from '@testing-library/react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

jest.useFakeTimers();

jest.mock('@/lib/services/authService', () => ({
  authService: {
    clearSession: jest.fn().mockResolvedValue(undefined),
    isTokenValid: jest.fn().mockResolvedValue(true),
  },
}));

import { authService } from '@/lib/services/authService';

const mockClearSession = authService.clearSession as jest.MockedFunction<typeof authService.clearSession>;
const mockIsTokenValid = authService.isTokenValid as jest.MockedFunction<typeof authService.isTokenValid>;

describe('useSessionTimeout', () => {
  beforeEach(() => {
    mockClearSession.mockClear();
    mockIsTokenValid.mockClear().mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('calls clearSession after the inactivity timeout', async () => {
    renderHook(() => useSessionTimeout(1000, 60_000));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockClearSession).toHaveBeenCalledWith('timeout');
  });

  it('does not call clearSession before the timeout', async () => {
    renderHook(() => useSessionTimeout(1000, 60_000));
    act(() => { jest.advanceTimersByTime(999); });
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it('resets the inactivity timer when a user event fires', async () => {
    renderHook(() => useSessionTimeout(1000, 60_000));
    act(() => { jest.advanceTimersByTime(800); });
    // Simulate user activity — fires click event which resets the timer
    act(() => { window.dispatchEvent(new Event('click')); });
    act(() => { jest.advanceTimersByTime(800); }); // 800ms since last reset
    expect(mockClearSession).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(200); }); // Total 1000ms since reset
    expect(mockClearSession).toHaveBeenCalledWith('timeout');
  });

  it('calls clearSession with "error" when token validation fails', async () => {
    mockIsTokenValid.mockResolvedValue(false);
    renderHook(() => useSessionTimeout(60_000, 500));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(mockClearSession).toHaveBeenCalledWith('error');
  });

  it('does not call clearSession from interval when token is valid', async () => {
    mockIsTokenValid.mockResolvedValue(true);
    renderHook(() => useSessionTimeout(60_000, 500));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockClearSession).not.toHaveBeenCalled();
  });
});
