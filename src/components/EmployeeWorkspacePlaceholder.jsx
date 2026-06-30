import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coffee,
  DollarSign,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  Save,
  Settings2,
  SunMedium,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { desktopRoleLabel } from "@/lib/auth";
import { formatDateTimeForDisplay } from "@/lib/app-utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

const DEFAULT_RULES = {
  workStart: "09:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workEnd: "18:00",
  lunchBreakMin: 60,
  workDaysPerMonth: 22,
  overtimeMultiplier: 1.5,
  lateToleMin: 10,
};

function timeToMinutes(value, fallback = 0) {
  const [hours, minutes] = String(value || "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return hours * 60 + minutes;
}

function minutesBetween(start, end) {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start));
}

function formatHours(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return `${(safeMinutes / 60).toFixed(safeMinutes % 60 === 0 ? 0 : 1)}h`;
}

function normalizeRules(rules) {
  const merged = { ...DEFAULT_RULES, ...rules };
  const lunchBreakMin =
    minutesBetween(merged.lunchStart, merged.lunchEnd) || Number(merged.lunchBreakMin) || 0;
  return {
    ...merged,
    lunchBreakMin,
  };
}

function buildScheduleSegments(rules) {
  const r = normalizeRules(rules);
  return [
    {
      key: "morning",
      label: "上午上班",
      time: `${r.workStart} - ${r.lunchStart}`,
      minutes: minutesBetween(r.workStart, r.lunchStart),
      icon: SunMedium,
    },
    {
      key: "lunch",
      label: "中午午休",
      time: `${r.lunchStart} - ${r.lunchEnd}`,
      minutes: minutesBetween(r.lunchStart, r.lunchEnd),
      icon: Coffee,
    },
    {
      key: "afternoon",
      label: "下午上班",
      time: `${r.lunchEnd} - ${r.workEnd}`,
      minutes: minutesBetween(r.lunchEnd, r.workEnd),
      icon: Clock,
    },
  ];
}

function calcDailyWorkMinutes(rules) {
  const [morning, , afternoon] = buildScheduleSegments(rules);
  const segmentedMinutes = morning.minutes + afternoon.minutes;
  if (segmentedMinutes > 0) return segmentedMinutes;
  const r = normalizeRules(rules);
  return Math.max(0, minutesBetween(r.workStart, r.workEnd) - Number(r.lunchBreakMin));
}

function calcHourlyRate(monthlySalary, rules) {
  const r = normalizeRules(rules);
  const dailyMin = calcDailyWorkMinutes(r);
  const monthlyHrs = (Number(r.workDaysPerMonth) * dailyMin) / 60;
  if (!monthlyHrs || !monthlySalary) return 0;
  return monthlySalary / monthlyHrs;
}

export default function EmployeeWorkspace({ currentUser, onBackToZones, onLogout }) {
  const [tab, setTab] = useState("users");
  const [mobileUsers, setMobileUsers] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [overview, setOverview] = useState([]);
  const [overviewMonth, setOverviewMonth] = useState(todayMonth());
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [salaries, setSalaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState("");

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const loadAll = useCallback(async () => {
    try {
      const [usersRes, leavesRes, rulesRes, salariesRes] = await Promise.all([
        api.getMobileUsers(),
        api.getAttendanceLeaves(),
        api.getAttendanceRules(),
        api.getAttendanceSalaries(),
      ]);
      setMobileUsers(usersRes.data || usersRes || []);
      setLeaves(leavesRes.leaves || []);
      if (rulesRes?.rules) setRules(normalizeRules(rulesRes.rules));
      if (salariesRes?.salaries) setSalaries(salariesRes.salaries);
    } catch (err) {
      console.warn("loadAll:", err.message);
    }
  }, []);

  const loadOverview = useCallback(async (month) => {
    setLoading(true);
    try {
      const res = await api.getAttendanceOverview(month);
      setOverview(res.overview || []);
      if (res.rules) setRules(normalizeRules(res.rules));
    } catch (err) {
      console.warn("loadOverview:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadOverview(overviewMonth);
  }, [loadOverview, overviewMonth]);

  const updateRole = useCallback(async (userId, role) => {
    setActionId(userId);
    try {
      const res = await api.updateMobileUserRole(userId, role);
      setMobileUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...res.user } : u)));
    } catch (err) {
      console.warn("updateRole:", err.message);
    } finally {
      setActionId("");
    }
  }, []);

  const updateSalary = useCallback(async (userId, monthlySalary) => {
    try {
      const res = await api.updateAttendanceSalary(userId, monthlySalary);
      if (res.salaries) setSalaries(res.salaries);
    } catch (err) {
      console.warn("updateSalary:", err.message);
    }
  }, []);

  const approveLeave = useCallback(async (id, status) => {
    setActionId(id);
    try {
      await api.updateLeaveStatus(id, status);
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    } catch (err) {
      console.warn("approveLeave:", err.message);
    } finally {
      setActionId("");
    }
  }, []);

  const saveRules = useCallback(async (newRules) => {
    try {
      const normalized = normalizeRules(newRules);
      const res = await api.updateAttendanceRules(normalized);
      if (res.rules) setRules(normalizeRules(res.rules));
    } catch (err) {
      console.warn("saveRules:", err.message);
    }
  }, []);

  const pendingCount = useMemo(() => leaves.filter((l) => l.status === "pending").length, [leaves]);

  return (
    <main className="employee-shell">
      <header className="zone-topbar">
        <Button variant="ghost" size="sm" onClick={onBackToZones} className="ghost-button compact">
          <ArrowLeft size={15} />
          业务专区
        </Button>
        <div className="zone-user-actions">
          <span className="session-chip">
            <UserRound size={15} />
            {currentUser.name || currentUser.phone} · {desktopRoleLabel(currentUser.role)}
          </span>
          <Button variant="ghost" size="sm" onClick={onLogout} className="ghost-button compact">
            <LogOut size={15} />
            退出
          </Button>
        </div>
      </header>

      <section className="employee-workspace">
        <div className="employee-header">
          <div>
            <p className="eyebrow">EMPLOYEE WORKSPACE</p>
            <h1>员工专区</h1>
          </div>
        </div>

        <EmployeeScheduleSummary
          rules={rules}
          employeeCount={mobileUsers.length}
          pendingCount={pendingCount}
        />

        <Tabs value={tab} onValueChange={setTab} className="employee-tabs">
          <TabsList>
            <TabsTrigger value="users">
              <Users size={15} className="tab-icon" />
              员工管理
            </TabsTrigger>
            <TabsTrigger value="rules">
              <Settings2 size={15} className="tab-icon" />
              考勤规则
            </TabsTrigger>
            <TabsTrigger value="leaves">
              <Clock size={15} className="tab-icon" />
              请假审批
              {pendingCount > 0 && (
                <span className="employee-badge">{pendingCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="overview">
              <DollarSign size={15} className="tab-icon" />
              考勤总览
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="employee-tab-content">
          {tab === "users" && (
            <EmployeeUsers
              users={mobileUsers}
              salaries={salaries}
              rules={rules}
              actionId={actionId}
              onUpdateRole={updateRole}
              onUpdateSalary={updateSalary}
              onRefresh={loadAll}
            />
          )}
          {tab === "rules" && (
            <AttendanceRules
              rules={rules}
              onSave={saveRules}
            />
          )}
          {tab === "leaves" && (
            <EmployeeLeaves
              leaves={leaves}
              actionId={actionId}
              onApprove={approveLeave}
              onRefresh={() => api.getAttendanceLeaves().then(r => setLeaves(r.leaves || []))}
            />
          )}
          {tab === "overview" && (
            <EmployeeOverview
              overview={overview}
              month={overviewMonth}
              loading={loading}
              rules={rules}
              onMonthChange={setOverviewMonth}
              onRefresh={() => loadOverview(overviewMonth)}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function EmployeeScheduleSummary({ rules, employeeCount, pendingCount }) {
  const normalized = normalizeRules(rules);
  const scheduleSegments = buildScheduleSegments(normalized);
  const dailyMin = calcDailyWorkMinutes(normalized);

  return (
    <section className="employee-schedule-summary">
      <div className="employee-schedule-main">
        <div>
          <span className="employee-schedule-label">今日标准班次</span>
          <strong>
            {normalized.workStart} - {normalized.workEnd}
          </strong>
        </div>
        <div className="employee-schedule-meta">
          <span>{formatHours(dailyMin)} 日净工时</span>
          <span>{employeeCount} 个手机账号</span>
          <span>{pendingCount} 条待审批</span>
        </div>
      </div>
      <div className="employee-schedule-segments">
        {scheduleSegments.map((segment) => {
          const SegmentIcon = segment.icon;
          return (
            <div className={`employee-schedule-segment ${segment.key}`} key={segment.key}>
              <SegmentIcon size={16} />
              <span>{segment.label}</span>
              <strong>{segment.time}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Employee Users ──────────────────────────────────────────────────────────
function EmployeeUsers({ users, salaries, rules, actionId, onUpdateRole, onUpdateSalary, onRefresh }) {
  const [editingSalary, setEditingSalary] = useState(null);
  const [salaryInput, setSalaryInput] = useState("");

  const startEditSalary = (userId, current) => {
    setEditingSalary(userId);
    setSalaryInput(String(current || ""));
  };

  const commitSalary = async (userId) => {
    const val = parseFloat(salaryInput);
    if (!isNaN(val) && val >= 0) {
      await onUpdateSalary(userId, val);
    }
    setEditingSalary(null);
  };

  return (
    <div className="employee-panel">
      <div className="employee-panel-head">
        <h3>员工账号管理</h3>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="ghost-button compact">
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="employee-empty">
          <p>暂无手机注册账号。</p>
          <p className="text-muted">员工在手机端注册后，这里会显示账号。</p>
        </div>
      ) : (
        <div className="employee-user-list">
          {users.map((user) => {
            const monthlySalary = salaries[user.id] || 0;
            const hourly = calcHourlyRate(monthlySalary, rules);
            return (
              <div className="employee-user-row" key={user.id}>
                <div className="employee-user-avatar">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name || "avatar"} />
                  ) : (
                    <span>{String(user.name || user.phone || "员").slice(0, 1)}</span>
                  )}
                </div>
                <div className="employee-user-info">
                  <strong>{user.name || "未填写"}</strong>
                  <span>{user.phone || "—"}</span>
                  <div className="employee-user-meta">
                    <small>注册：{formatDateTimeForDisplay(user.createdAt)}</small>
                    <small>更新：{formatDateTimeForDisplay(user.updatedAt)}</small>
                  </div>
                </div>

                <div className="employee-salary-cell">
                  <span className="employee-salary-label">月薪</span>
                  {editingSalary === user.id ? (
                    <div className="employee-salary-edit">
                      <span className="employee-salary-currency">¥</span>
                      <input
                        className="employee-salary-input"
                        type="number"
                        min="0"
                        step="100"
                        value={salaryInput}
                        onChange={(e) => setSalaryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitSalary(user.id);
                          if (e.key === "Escape") setEditingSalary(null);
                        }}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="icon-button employee-salary-save"
                        onClick={() => commitSalary(user.id)}
                      >
                        <Save size={13} />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="employee-salary-display"
                      onClick={() => startEditSalary(user.id, monthlySalary)}
                    >
                      {monthlySalary > 0 ? (
                        <>
                          <span className="employee-salary-amount">¥{monthlySalary.toLocaleString()}</span>
                          {hourly > 0 && (
                            <span className="employee-salary-rate">≈ ¥{hourly.toFixed(2)}/h</span>
                          )}
                        </>
                      ) : (
                        <span className="employee-salary-unset">
                          <Pencil size={11} />
                          设置月薪
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <select
                  value={["pending", "admin", "employee"].includes(user.role) ? user.role : "pending"}
                  onChange={(e) => onUpdateRole(user.id, e.target.value)}
                  disabled={actionId === user.id}
                  className="employee-role-select"
                >
                  <option value="pending">普通用户</option>
                  <option value="employee">员工</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Attendance Rules ────────────────────────────────────────────────────────
function AttendanceRules({ rules, onSave }) {
  const [form, setForm] = useState(() => normalizeRules(rules));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm((prev) => normalizeRules({ ...prev, ...rules }));
  }, [rules]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(normalizeRules(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const normalizedForm = normalizeRules(form);
  const scheduleSegments = buildScheduleSegments(normalizedForm);
  const dailyMin = calcDailyWorkMinutes(normalizedForm);
  const dailyHrs = dailyMin / 60;
  const monthlyHrs = dailyHrs * Number(form.workDaysPerMonth);

  return (
    <div className="employee-panel">
      <div className="employee-panel-head">
        <h3>考勤规则配置</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className={`ghost-button compact ${saved ? "employee-save-ok" : ""}`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? "已保存" : "保存"}
        </Button>
      </div>

      <div className="rules-day-plan">
        <div className="rules-day-plan-head">
          <div>
            <p className="rules-day-kicker">今日班次</p>
            <h4>上午 / 午休 / 下午</h4>
          </div>
          <div className="rules-day-total">
            <span>{formatHours(dailyMin)}</span>
            <small>日净工时</small>
          </div>
        </div>
        <div className="rules-segment-grid">
          {scheduleSegments.map((segment) => {
            const SegmentIcon = segment.icon;
            return (
              <div className={`rules-segment-card ${segment.key}`} key={segment.key}>
                <div className="rules-segment-icon">
                  <SegmentIcon size={17} />
                </div>
                <span className="rules-segment-label">{segment.label}</span>
                <strong>{segment.time}</strong>
                <small>{formatHours(segment.minutes)}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rules-summary-banner">
        <div className="rules-summary-item">
          <span className="rules-summary-val">{dailyHrs.toFixed(1)}h</span>
          <span className="rules-summary-label">日工时</span>
        </div>
        <div className="rules-summary-sep" />
        <div className="rules-summary-item">
          <span className="rules-summary-val">{form.workDaysPerMonth}天</span>
          <span className="rules-summary-label">月工作日</span>
        </div>
        <div className="rules-summary-sep" />
        <div className="rules-summary-item">
          <span className="rules-summary-val">{monthlyHrs.toFixed(0)}h</span>
          <span className="rules-summary-label">月标准工时</span>
        </div>
      </div>

      <div className="rules-grid">
        <div className="rules-group">
          <h4 className="rules-group-title">班次时间</h4>
          <div className="rules-row">
            <label className="rules-label">上午上班开始</label>
            <input
              type="time"
              className="rules-input"
              value={form.workStart}
              onChange={(e) => set("workStart", e.target.value)}
            />
          </div>
          <div className="rules-row">
            <label className="rules-label">午休开始</label>
            <input
              type="time"
              className="rules-input"
              value={form.lunchStart}
              onChange={(e) => set("lunchStart", e.target.value)}
            />
          </div>
          <div className="rules-row">
            <label className="rules-label">午休结束 / 下午开始</label>
            <input
              type="time"
              className="rules-input"
              value={form.lunchEnd}
              onChange={(e) => set("lunchEnd", e.target.value)}
            />
          </div>
          <div className="rules-row">
            <label className="rules-label">下午下班时间</label>
            <input
              type="time"
              className="rules-input"
              value={form.workEnd}
              onChange={(e) => set("workEnd", e.target.value)}
            />
          </div>
        </div>

        <div className="rules-group">
          <h4 className="rules-group-title">薪资计算</h4>
          <div className="rules-row">
            <label className="rules-label">每月工作天数</label>
            <div className="rules-input-wrap">
              <input
                type="number"
                className="rules-input"
                min="1"
                max="31"
                step="1"
                value={form.workDaysPerMonth}
                onChange={(e) => set("workDaysPerMonth", Number(e.target.value))}
              />
              <span className="rules-input-unit">天</span>
            </div>
          </div>
          <div className="rules-row">
            <label className="rules-label">加班工资倍率</label>
            <div className="rules-input-wrap">
              <input
                type="number"
                className="rules-input"
                min="1"
                max="5"
                step="0.5"
                value={form.overtimeMultiplier}
                onChange={(e) => set("overtimeMultiplier", Number(e.target.value))}
              />
              <span className="rules-input-unit">倍</span>
            </div>
          </div>
          <div className="rules-row">
            <label className="rules-label">迟到容忍（分钟）</label>
            <div className="rules-input-wrap">
              <input
                type="number"
                className="rules-input"
                min="0"
                max="60"
                step="5"
                value={form.lateToleMin}
                onChange={(e) => set("lateToleMin", Number(e.target.value))}
              />
              <span className="rules-input-unit">分钟</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rules-formula-note">
        <span className="rules-formula-icon">ƒ</span>
        时薪 = 月薪 ÷ (每月工作天数 × 日净工时) · 日净工时 = 上午上班 + 下午上班
      </div>
    </div>
  );
}

// ── Employee Leaves ─────────────────────────────────────────────────────────
function EmployeeLeaves({ leaves, actionId, onApprove, onRefresh }) {
  const pending = leaves.filter((l) => l.status === "pending");
  const history = leaves.filter((l) => l.status !== "pending");

  return (
    <div className="employee-panel">
      <div className="employee-panel-head">
        <h3>请假审批</h3>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="ghost-button compact">
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>

      {pending.length === 0 && history.length === 0 ? (
        <div className="employee-empty">
          <p>暂无请假记录。</p>
          <p className="text-muted">员工在手机端提交请假后，这里会显示。</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="employee-section">
              <h4 className="employee-section-title">待审批 ({pending.length})</h4>
              {pending.map((leave) => (
                <div className="employee-leave-card" key={leave.id}>
                  <div className="employee-leave-info">
                    <div className="employee-leave-head">
                      <span className="employee-leave-type">{leave.type}</span>
                      <span className="employee-leave-dates">{leave.startDate} ~ {leave.endDate}</span>
                    </div>
                    {leave.reason && <p className="employee-leave-reason">{leave.reason}</p>}
                    <small className="employee-leave-meta">
                      {leave.userId} · {formatDateTimeForDisplay(leave.createdAt)}
                    </small>
                  </div>
                  <div className="employee-leave-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="employee-approve-btn"
                      disabled={actionId === leave.id}
                      onClick={() => onApprove(leave.id, "approved")}
                    >
                      {actionId === leave.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      批准
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="employee-reject-btn"
                      disabled={actionId === leave.id}
                      onClick={() => onApprove(leave.id, "rejected")}
                    >
                      <XCircle size={14} />
                      拒绝
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="employee-section">
              <h4 className="employee-section-title">审批历史</h4>
              {history.map((leave) => (
                <div className={`employee-leave-card ${leave.status === "approved" ? "approved" : "rejected"}`} key={leave.id}>
                  <div className="employee-leave-info">
                    <div className="employee-leave-head">
                      <span className="employee-leave-type">{leave.type}</span>
                      <span className="employee-leave-dates">{leave.startDate} ~ {leave.endDate}</span>
                    </div>
                    {leave.reason && <p className="employee-leave-reason">{leave.reason}</p>}
                    <small className="employee-leave-meta">
                      {leave.userId} · {formatDateTimeForDisplay(leave.createdAt)}
                    </small>
                  </div>
                  <span className={`employee-leave-status ${leave.status}`}>
                    {leave.status === "approved" ? "已批准" : "已拒绝"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Employee Overview ────────────────────────────────────────────────────────
function EmployeeOverview({ overview, month, loading, rules, onMonthChange, onRefresh }) {
  const prevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    onMonthChange(d.toISOString().slice(0, 7));
  };
  const nextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    onMonthChange(d.toISOString().slice(0, 7));
  };

  const totalPay = overview.reduce((s, r) => s + (r.estimatedPay || 0), 0);
  const totalHours = overview.reduce((s, r) => s + (r.totalHours || 0), 0);
  const activeCnt = overview.filter((r) => r.workDays > 0).length;

  return (
    <div className="employee-panel">
      <div className="employee-panel-head">
        <h3>考勤总览</h3>
        <div className="employee-month-nav">
          <Button variant="ghost" size="sm" onClick={prevMonth} className="icon-button">‹</Button>
          <span className="employee-month-label">{month}</span>
          <Button variant="ghost" size="sm" onClick={nextMonth} className="icon-button">›</Button>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="ghost-button compact">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {!loading && overview.length > 0 && (
        <div className="overview-kpi-row">
          <div className="overview-kpi-card">
            <span className="overview-kpi-val">{activeCnt}</span>
            <span className="overview-kpi-label">出勤人数</span>
          </div>
          <div className="overview-kpi-card">
            <span className="overview-kpi-val">{totalHours.toFixed(1)}h</span>
            <span className="overview-kpi-label">总工时</span>
          </div>
          <div className="overview-kpi-card accent">
            <span className="overview-kpi-val">¥{totalPay.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            <span className="overview-kpi-label">预估薪资合计</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="employee-empty">
          <Loader2 size={20} className="animate-spin" />
          <p>加载中...</p>
        </div>
      ) : overview.length === 0 ? (
        <div className="employee-empty">
          <p>暂无考勤数据。</p>
          <p className="text-muted">员工开始打卡签到后，这里会显示统计数据。</p>
        </div>
      ) : (
        <div className="employee-overview-table-wrap">
          <table className="employee-overview-table">
            <thead>
              <tr>
                <th>员工</th>
                <th>角色</th>
                <th>出勤天数</th>
                <th>实际工时</th>
                <th>请假天数</th>
                <th>月薪</th>
                <th>时薪</th>
                <th>预估应付</th>
              </tr>
            </thead>
            <tbody>
              {overview.map((row) => (
                <tr key={row.userId}>
                  <td><strong>{row.name || row.phone}</strong></td>
                  <td>{desktopRoleLabel(row.role)}</td>
                  <td className="employee-stat-num">{row.workDays}</td>
                  <td className="employee-stat-num">{row.totalHours}h</td>
                  <td className="employee-stat-num">{row.leaveDays}</td>
                  <td className="employee-stat-num">
                    {row.monthlySalary > 0 ? `¥${row.monthlySalary.toLocaleString()}` : <span className="overview-unset">未设置</span>}
                  </td>
                  <td className="employee-stat-num">
                    {row.hourlyRate > 0 ? `¥${row.hourlyRate.toFixed(2)}` : "—"}
                  </td>
                  <td className="employee-stat-num overview-pay">
                    {row.estimatedPay > 0 ? `¥${row.estimatedPay.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
