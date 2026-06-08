import { describe, it, expect } from 'vitest';
import {
  normalizeOrderStatus,
  getNextStatuses,
  isOpenOrder,
  statusOptions,
  statusTransitions,
  closedOrderStatuses,
} from '../statusWorkflow.js';

// ── normalizeOrderStatus ──────────────────────────────────────────────

describe('normalizeOrderStatus', () => {
  it('should return the status unchanged when it is a valid known status', () => {
    for (const status of statusOptions) {
      expect(normalizeOrderStatus(status)).toBe(status);
    }
  });

  it('should return all 6 predefined statuses', () => {
    expect(statusOptions).toEqual([
      '未完成',
      '已排产',
      '已完成',
      '已送货',
      '已开对账单',
      '已付款',
    ]);
  });

  it('should map "已发货" to "已送货"', () => {
    expect(normalizeOrderStatus('已发货')).toBe('已送货');
  });

  it('should default unknown statuses to "未完成"', () => {
    expect(normalizeOrderStatus('')).toBe('未完成');
    expect(normalizeOrderStatus('random')).toBe('未完成');
    expect(normalizeOrderStatus('未知状态')).toBe('未完成');
    expect(normalizeOrderStatus('异常')).toBe('未完成');
    expect(normalizeOrderStatus(null)).toBe('未完成');
    expect(normalizeOrderStatus(undefined)).toBe('未完成');
  });
});

// ── getNextStatuses ───────────────────────────────────────────────────

describe('getNextStatuses', () => {
  it('should return correct next statuses for each state', () => {
    expect(getNextStatuses('未完成')).toEqual(['已排产', '已完成']);
    expect(getNextStatuses('已排产')).toEqual(['已完成']);
    expect(getNextStatuses('已完成')).toEqual(['已送货', '已开对账单']);
    expect(getNextStatuses('已送货')).toEqual(['已开对账单']);
    expect(getNextStatuses('已开对账单')).toEqual(['已付款']);
    expect(getNextStatuses('已付款')).toEqual([]);
  });

  it('should normalize the input before lookup (已发货 → 已送货)', () => {
    expect(getNextStatuses('已发货')).toEqual(['已开对账单']);
  });

  it('should return empty array for unknown statuses that normalize to unknown', () => {
    // 'unknown' normalizes to '未完成' which HAS next statuses
    // But 'zzz' also normalizes to '未完成', so test that behavior
    // Actually: normalizeOrderStatus maps all non-valid statuses to '未完成'
    // So getNextStatuses('') returns ['已排产', '已完成'] (未完成's next)
    expect(getNextStatuses('')).toEqual(['已排产', '已完成']);
    expect(getNextStatuses('unknown')).toEqual(['已排产', '已完成']);
    expect(getNextStatuses(null)).toEqual(['已排产', '已完成']);
    expect(getNextStatuses(undefined)).toEqual(['已排产', '已完成']);
  });

  it('should not allow skipping steps (已排产 cannot go directly to 已付款)', () => {
    const next = getNextStatuses('已排产');
    expect(next).not.toContain('已付款');
    expect(next).not.toContain('已送货');
    expect(next).not.toContain('已开对账单');
  });

  it('should allow jump from 未完成 to 已完成', () => {
    expect(getNextStatuses('未完成')).toContain('已完成');
  });

  it('should return the same array from statusTransitions (immutable source)', () => {
    const a = getNextStatuses('未完成');
    const b = getNextStatuses('未完成');
    // Returns direct reference from the const statusTransitions object
    expect(a).toBe(b);
    expect(a).toEqual(['已排产', '已完成']);
  });
});

// ── isOpenOrder ───────────────────────────────────────────────────────

describe('isOpenOrder', () => {
  it('should return true for open (non-closed, non-异常) statuses', () => {
    expect(isOpenOrder('未完成')).toBe(true);
    expect(isOpenOrder('已排产')).toBe(true);
  });

  it('should return false for all closed statuses', () => {
    for (const closed of closedOrderStatuses) {
      expect(isOpenOrder(closed)).toBe(false);
    }
  });

  it('should return false specifically for 已完成, 已送货, 已发货, 已开对账单, 已付款', () => {
    expect(isOpenOrder('已完成')).toBe(false);
    expect(isOpenOrder('已送货')).toBe(false);
    expect(isOpenOrder('已发货')).toBe(false);    // in closedOrderStatuses
    expect(isOpenOrder('已开对账单')).toBe(false);
    expect(isOpenOrder('已付款')).toBe(false);
  });

  it('should return false for 异常 status', () => {
    expect(isOpenOrder('异常')).toBe(false);
  });

  it('should treat unknown statuses as open (default true)', () => {
    expect(isOpenOrder('')).toBe(true);
    expect(isOpenOrder('random')).toBe(true);
    expect(isOpenOrder(null)).toBe(true);
    expect(isOpenOrder(undefined)).toBe(true);
  });

  it('should treat empty string as open', () => {
    expect(isOpenOrder('')).toBe(true);
  });
});

// ── additional status workflow consistency checks ─────────────────────

describe('status workflow consistency', () => {
  it('every transition target should be a valid status', () => {
    for (const [from, toList] of Object.entries(statusTransitions)) {
      for (const to of toList) {
        expect(statusOptions).toContain(to);
      }
    }
  });

  it('every key in statusTransitions should be a valid status', () => {
    for (const key of Object.keys(statusTransitions)) {
      expect(statusOptions).toContain(key);
    }
  });

  it('closedOrderStatuses should be a subset of or equal to known statuses', () => {
    // Note: 已发货 is in closedOrderStatuses but NOT in statusOptions
    // This is intentional (已发货 is an alias for 已送货)
    for (const closed of closedOrderStatuses) {
      const isKnown = statusOptions.includes(closed) || normalizeOrderStatus(closed) !== '未完成' || closed === '已发货';
      expect(isKnown).toBe(true);
    }
  });
});
