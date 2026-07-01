import { Router } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../db.js";
import { authMiddleware } from "../auth.js";
import { findUserByMobileToken } from "./users.js";
import {
  buildPayrollCalendar,
  calculateAttendanceMinutes,
  calculateHourlyRate,
  getPayrollCycleForDate,
  normalizeAttendanceRules,
} from "../attendanceRules.js";

const router = Router();

function readMobileToken(req) {
  return String(req.headers["x-mobile-user-token"] || req.query.mobileToken || "").trim();
}

function mobileUserAuth(req, res, next) {
  if (readMobileToken(req)) return next();
  return authMiddleware(req, res, next);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/attendance/today — current user's today record
router.get("/today", mobileUserAuth, async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    const date = todayDate();
    let record = await prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (!record) {
      record = await prisma.attendanceRecord.create({
        data: { id: `att-${randomUUID()}`, userId: user.id, date },
      });
    }
    res.json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/check-in
router.post("/check-in", mobileUserAuth, async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    const date = todayDate();
    const note = String(req.body?.note || "").trim();
    let record = await prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (!record) {
      record = await prisma.attendanceRecord.create({
        data: { id: `att-${randomUUID()}`, userId: user.id, date, checkIn: new Date(), note },
      });
    } else if (!record.checkIn) {
      record = await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { checkIn: new Date(), note: note || record.note },
      });
    }
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/check-out
router.post("/check-out", mobileUserAuth, async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    const date = todayDate();
    const note = String(req.body?.note || "").trim();
    let record = await prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (!record) {
      return res.status(400).json({ error: "今天还没有签到，无法签退" });
    }
    if (!record.checkIn) {
      return res.status(400).json({ error: "今天还没有签到，无法签退" });
    }
    record = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { checkOut: new Date(), note: note || record.note },
    });
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function cycleDateFromMonth(month) {
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : todayDate();
}

function attendanceCycleWhere(userId, cycle) {
  return { userId, date: { gte: cycle.startDate, lte: cycle.endDate } };
}

// GET /api/attendance/stats?month=2026-06
router.get("/stats", mobileUserAuth, async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    const month = String(req.query.month || todayDate().slice(0, 7));
    const rulesSetting = await prisma.appSetting.findUnique({ where: { key: "attendance_rules" } });
    const rules = normalizeAttendanceRules(rulesSetting?.data || {});
    const cycle = getPayrollCycleForDate(cycleDateFromMonth(month), rules);
    const records = await prisma.attendanceRecord.findMany({
      where: attendanceCycleWhere(user.id, cycle),
      orderBy: { date: "asc" },
    });

    let workDays = 0;
    let totalMinutes = 0;
    const daily = records.map((r) => {
      const day = {
        date: r.date,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        note: r.note,
        minutes: 0,
      };
      if (r.checkIn && r.checkOut) {
        const mins = calculateAttendanceMinutes(r, rules);
        if (mins > 0) {
          day.minutes = mins;
          workDays++;
          totalMinutes += mins;
        }
      }
      return day;
    });

    res.json({
      month,
      workDays,
      totalHours: (totalMinutes / 60).toFixed(1),
      totalMinutes,
      rules,
      cycle,
      daily,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/leaves
router.get("/leaves", mobileUserAuth, async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    const where = isAdmin ? {} : { userId: user.id };
    const leaves = await prisma.leaveRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json({ leaves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/leaves
router.post("/leaves", mobileUserAuth, async (req, res) => {
  try {
    const user = await findUserByMobileToken(req);
    if (!user) return res.status(401).json({ error: "请先登录手机账号" });

    const type = String(req.body?.type || "").trim();
    const startDate = String(req.body?.startDate || "").trim();
    const endDate = String(req.body?.endDate || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (!type) return res.status(400).json({ error: "请选择请假类型" });
    if (!startDate || !endDate) return res.status(400).json({ error: "请填写起止日期" });

    const leave = await prisma.leaveRecord.create({
      data: {
        id: `leave-${randomUUID()}`,
        userId: user.id,
        type,
        startDate,
        endDate,
        reason,
        status: "pending",
      },
    });
    res.json({ ok: true, leave });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/attendance/leaves/:id — approve/reject (admin)
router.patch("/leaves/:id", authMiddleware, async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim();
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "状态值只能是 approved 或 rejected" });
    }
    const leave = await prisma.leaveRecord.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ ok: true, leave });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "请假记录不存在" });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/rules — get configurable work schedule rules
router.get("/rules", mobileUserAuth, async (req, res) => {
  try {
    if (readMobileToken(req)) {
      const user = await findUserByMobileToken(req);
      if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    }
    const setting = await prisma.appSetting.findUnique({ where: { key: "attendance_rules" } });
    res.json({ rules: normalizeAttendanceRules(setting?.data || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance/rules — update configurable work schedule rules
router.put("/rules", authMiddleware, async (req, res) => {
  try {
    const data = req.body || {};
    const rules = normalizeAttendanceRules(data);
    await prisma.appSetting.upsert({
      where: { key: "attendance_rules" },
      update: { data: rules },
      create: { key: "attendance_rules", data: rules },
    });
    res.json({ ok: true, rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/payroll-calendar — server-synced payroll cycle and pay dates
router.get("/payroll-calendar", mobileUserAuth, async (req, res) => {
  try {
    if (readMobileToken(req)) {
      const user = await findUserByMobileToken(req);
      if (!user) return res.status(401).json({ error: "请先登录手机账号" });
    }
    const setting = await prisma.appSetting.findUnique({ where: { key: "attendance_rules" } });
    const rules = normalizeAttendanceRules(setting?.data || {});
    const date = String(req.query.date || todayDate());
    res.json({ calendar: buildPayrollCalendar(date, rules), rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/salaries — get all employee monthly salaries
router.get("/salaries", authMiddleware, async (req, res) => {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "employee_salaries" } });
    res.json({ salaries: setting?.data || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance/salaries/:userId — set per-employee monthly salary
router.put("/salaries/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const monthlySalary = Number(req.body?.monthlySalary) || 0;
    const setting = await prisma.appSetting.findUnique({ where: { key: "employee_salaries" } });
    const salaries = { ...(setting?.data || {}), [userId]: monthlySalary };
    await prisma.appSetting.upsert({
      where: { key: "employee_salaries" },
      update: { data: salaries },
      create: { key: "employee_salaries", data: salaries },
    });
    res.json({ ok: true, salaries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/admin/overview?month=2026-06 — admin: all employees' attendance + salary calc
router.get("/admin/overview", authMiddleware, async (req, res) => {
  try {
    const month = String(req.query.month || todayDate().slice(0, 7));
    const users = await prisma.mobileUser.findMany({
      where: { role: { not: "pending" } },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { name: "asc" },
    });

    // Load rules and salaries
    const rulesSetting = await prisma.appSetting.findUnique({ where: { key: "attendance_rules" } });
    const rules = normalizeAttendanceRules(rulesSetting?.data || {});
    const salarySetting = await prisma.appSetting.findUnique({ where: { key: "employee_salaries" } });
    const salaries = salarySetting?.data || {};
    const cycle = getPayrollCycleForDate(cycleDateFromMonth(month), rules);

    const overview = [];
    for (const user of users) {
      const records = await prisma.attendanceRecord.findMany({
        where: attendanceCycleWhere(user.id, cycle),
      });
      let days = 0;
      let minutes = 0;
      for (const r of records) {
        if (r.checkIn && r.checkOut) {
          const m = calculateAttendanceMinutes(r, rules);
          if (m > 0) { days++; minutes += m; }
        } else if (r.checkIn) {
          days++;
        }
      }
      // Count leave days
      const leaves = await prisma.leaveRecord.findMany({
        where: {
          userId: user.id,
          status: "approved",
          AND: [
            { startDate: { lte: cycle.endDate } },
            { endDate: { gte: cycle.startDate } },
          ],
        },
      });
      let leaveDays = 0;
      for (const l of leaves) {
        const start = new Date(Math.max(new Date(l.startDate).getTime(), new Date(cycle.startDate).getTime()));
        const end = new Date(Math.min(new Date(l.endDate).getTime(), new Date(cycle.endDate).getTime()));
        if (end >= start) leaveDays += Math.ceil((end - start) / 86400000) + 1;
      }

      // Salary calculation
      const monthlySalary = Number(salaries[user.id]) || 0;
      const actualHours = minutes / 60;
      const hourlyRate = calculateHourlyRate(monthlySalary, rules);
      const estimatedPay = hourlyRate > 0 ? actualHours * hourlyRate : 0;

      overview.push({
        userId: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        workDays: days,
        totalHours: parseFloat(actualHours.toFixed(1)),
        leaveDays,
        monthlySalary,
        hourlyRate: parseFloat(hourlyRate.toFixed(2)),
        estimatedPay: parseFloat(estimatedPay.toFixed(2)),
      });
    }

    res.json({ month, cycle, overview, rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
