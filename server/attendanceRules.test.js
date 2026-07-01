import { describe, expect, it } from "vitest";

import {
  calculateAttendanceMinutes,
  calculateHourlyRate,
  dailyWorkMinutes,
  getPayrollCycleForDate,
  getPayDatesForCycle,
  normalizeAttendanceRules,
} from "./attendanceRules.js";

function at(time) {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(2026, 6, 1, hour, minute, 0);
}

function record(checkIn, checkOut) {
  return {
    date: "2026-07-01",
    checkIn: at(checkIn),
    checkOut: at(checkOut),
  };
}

describe("attendance rules", () => {
  it("uses 7:00 and 8:00 as flexible morning starts with tolerance", () => {
    const rules = normalizeAttendanceRules({ lateToleMin: 10 });

    expect(calculateAttendanceMinutes(record("07:05", "12:00"), rules)).toBe(300);
    expect(calculateAttendanceMinutes(record("07:11", "12:00"), rules)).toBe(240);
    expect(calculateAttendanceMinutes(record("08:11", "12:00"), rules)).toBe(229);
  });

  it("applies the same flexible start rule to the afternoon", () => {
    const rules = normalizeAttendanceRules({ lateToleMin: 10 });

    expect(calculateAttendanceMinutes(record("13:05", "18:00"), rules)).toBe(300);
    expect(calculateAttendanceMinutes(record("13:11", "18:00"), rules)).toBe(240);
    expect(calculateAttendanceMinutes(record("14:11", "18:00"), rules)).toBe(229);
  });

  it("excludes lunch and counts unlimited overtime at the normal hourly rate", () => {
    const rules = normalizeAttendanceRules({ lateToleMin: 10 });

    expect(calculateAttendanceMinutes(record("07:00", "20:00"), rules)).toBe(720);
    expect(calculateHourlyRate(7800, rules)).toBe(30);
  });

  it("uses 26 workdays for monthly salary hourly-rate calculation", () => {
    const rules = normalizeAttendanceRules({});

    expect(rules.workDaysPerMonth).toBe(26);
    expect(dailyWorkMinutes(rules)).toBe(600);
    expect(calculateHourlyRate(7800, rules)).toBe(30);
  });

  it("starts payroll cycles on the 11th and pays on the 25th and 10th", () => {
    const cycle = getPayrollCycleForDate("2026-07-01");

    expect(cycle).toEqual({
      startDate: "2026-06-11",
      endDate: "2026-07-10",
      label: "2026-06-11 至 2026-07-10",
    });
    expect(getPayDatesForCycle(cycle)).toEqual(["2026-06-25", "2026-07-10"]);
  });
});
