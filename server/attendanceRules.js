export const defaultAttendanceRules = {
  morningStartOptions: ["07:00", "08:00"],
  afternoonStartOptions: ["13:00", "14:00"],
  workStart: "07:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workEnd: "18:00",
  lunchBreakMin: 60,
  workDaysPerMonth: 26,
  overtimeMultiplier: 1,
  lateToleMin: 10,
  payrollCycleStartDay: 11,
  payDays: [25, 10],
};

export function timeToMinutes(value, fallback = 0) {
  const [hours, minutes] = String(value || "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return hours * 60 + minutes;
}

export function minutesBetween(start, end) {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start));
}

function normalizeTimeOptions(value, fallback) {
  const options = Array.isArray(value) ? value : [];
  const normalized = options
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    .slice(0, 2);
  return [...normalized, ...fallback].slice(0, 2);
}

export function normalizeAttendanceRules(rules = {}) {
  const merged = { ...defaultAttendanceRules, ...(rules || {}) };
  const morningStartOptions = normalizeTimeOptions(
    merged.morningStartOptions,
    defaultAttendanceRules.morningStartOptions,
  );
  const afternoonStartOptions = normalizeTimeOptions(
    merged.afternoonStartOptions,
    defaultAttendanceRules.afternoonStartOptions,
  );
  const lunchBreakMin =
    minutesBetween(merged.lunchStart, merged.lunchEnd) || Number(merged.lunchBreakMin) || 0;
  const payDays = Array.isArray(merged.payDays) && merged.payDays.length
    ? merged.payDays.map((day) => Number(day)).filter((day) => day >= 1 && day <= 31)
    : defaultAttendanceRules.payDays;

  return {
    ...merged,
    morningStartOptions,
    afternoonStartOptions,
    workStart: morningStartOptions[0],
    lunchBreakMin,
    workDaysPerMonth: Number(merged.workDaysPerMonth) || defaultAttendanceRules.workDaysPerMonth,
    overtimeMultiplier: 1,
    lateToleMin: Number(merged.lateToleMin) || 0,
    payrollCycleStartDay:
      Number(merged.payrollCycleStartDay) || defaultAttendanceRules.payrollCycleStartDay,
    payDays,
  };
}

export function dailyWorkMinutes(rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  const morning = minutesBetween(normalized.morningStartOptions[0], normalized.lunchStart);
  const afternoon = minutesBetween(normalized.afternoonStartOptions[0], normalized.workEnd);
  const segmented = morning + afternoon;
  if (segmented > 0) return segmented;
  return Math.max(
    0,
    minutesBetween(normalized.workStart, normalized.workEnd) - Number(normalized.lunchBreakMin),
  );
}

export function resolveSegmentStart(actualMinutes, startOptions, toleranceMin) {
  const sorted = startOptions.map((time) => timeToMinutes(time)).sort((a, b) => a - b);
  for (const start of sorted) {
    if (actualMinutes <= start + toleranceMin) return start;
  }
  return actualMinutes;
}

function recordMinuteOfDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function segmentMinutes({ checkIn, checkOut, starts, toleranceMin, segmentEnd }) {
  const segmentStart = timeToMinutes(starts[0]);
  const latestStart = timeToMinutes(starts[starts.length - 1]);
  const actualStart = Math.max(checkIn, segmentStart);
  if (checkOut <= actualStart || checkOut <= segmentStart) return 0;
  if (segmentEnd && actualStart >= segmentEnd) return 0;
  if (checkIn > latestStart + toleranceMin && checkIn >= segmentEnd) return 0;
  const countedStart = resolveSegmentStart(actualStart, starts, toleranceMin);
  const effectiveEnd = segmentEnd ? Math.min(checkOut, segmentEnd) : checkOut;
  return Math.max(0, effectiveEnd - countedStart);
}

export function calculateAttendanceMinutes(record, rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  const checkIn = recordMinuteOfDay(record?.checkIn);
  const checkOut = recordMinuteOfDay(record?.checkOut);
  if (checkIn === null || checkOut === null || checkOut <= checkIn) return 0;

  const lunchStart = timeToMinutes(normalized.lunchStart);
  const lunchEnd = timeToMinutes(normalized.lunchEnd);
  const toleranceMin = Number(normalized.lateToleMin) || 0;
  const morningMinutes = segmentMinutes({
    checkIn,
    checkOut,
    starts: normalized.morningStartOptions,
    toleranceMin,
    segmentEnd: lunchStart,
  });
  const afternoonMinutes = checkOut <= lunchEnd
    ? 0
    : segmentMinutes({
        checkIn: Math.max(checkIn, lunchEnd),
        checkOut,
        starts: normalized.afternoonStartOptions,
        toleranceMin,
      });

  return morningMinutes + afternoonMinutes;
}

export function calculateHourlyRate(monthlySalary, rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  const monthlyHours = (Number(normalized.workDaysPerMonth) * dailyWorkMinutes(normalized)) / 60;
  if (!monthlyHours || !monthlySalary) return 0;
  return Number(monthlySalary) / monthlyHours;
}

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPayrollCycleForDate(value = new Date(), rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  const date = dateOnly(value);
  const cycleDay = Number(normalized.payrollCycleStartDay) || 11;
  const start = new Date(date.getFullYear(), date.getMonth(), cycleDay);
  if (date.getDate() < cycleDay) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, cycleDay - 1);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    label: `${formatDate(start)} 至 ${formatDate(end)}`,
  };
}

export function getPayDatesForCycle(cycle, rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  const [firstPayDay, secondPayDay] = normalized.payDays;
  const start = dateOnly(cycle?.startDate || getPayrollCycleForDate(new Date(), normalized).startDate);
  const first = new Date(start.getFullYear(), start.getMonth(), firstPayDay || 25);
  const second = new Date(start.getFullYear(), start.getMonth() + 1, secondPayDay || 10);
  return [formatDate(first), formatDate(second)];
}

export function buildPayrollCalendar(value = new Date(), rules = {}) {
  const normalized = normalizeAttendanceRules(rules);
  const cycle = getPayrollCycleForDate(value, normalized);
  const payDates = getPayDatesForCycle(cycle, normalized);
  return {
    cycle,
    payDates,
    syncedAt: new Date().toISOString(),
    source: "server",
  };
}
