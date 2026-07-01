import { useEffect, useState, useMemo } from "react";
import { useI18n } from "../../App.jsx";
import { Field } from "../Field.jsx";
import { parseNumericValue, normalizeCalculatedNumber, orderRemainingQuantityField, productionScheduleStatusOptions } from "../../lib/app-utils.jsx";
import { X, KanbanSquare } from "lucide-react";
import { today } from "../../lib/utils.js";

export function ProductionScheduleModal({ customer, orders, employeeOptions = [], onClose, onSave }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    date: today(),
    quantity: "",
    line: "",
    status: "已排产",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const hasEmployeeOptions = employeeOptions.length > 0;

  const totalQuantity = useMemo(
    () =>
      orders.reduce((sum, order) => {
        const quantity = parseNumericValue(order[orderRemainingQuantityField] || order.quantity);
        return sum + quantity;
      }, 0),
    [orders],
  );

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    setForm((current) => {
      if (!hasEmployeeOptions) return { ...current, line: "" };
      if (employeeOptions.some((employee) => employee.value === current.line)) return current;
      return { ...current, line: employeeOptions[0].value };
    });
  }, [employeeOptions, hasEmployeeOptions]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.date || !form.line) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card production-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">PRODUCTION SCHEDULE</p>
            <h3>
              {t("{customer} · 排产 {count} 条订单", {
                customer: customer.name,
                count: orders.length,
              })}
            </h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("关闭")}>
            <X size={18} />
          </button>
        </div>

        <div className="production-summary">
          <span>{t("订单数：{count}", { count: orders.length })}</span>
          <span>
            {t("待排数量：{quantity}", { quantity: normalizeCalculatedNumber(totalQuantity) })}
          </span>
        </div>

        <div className="form-grid">
          <Field label={t("排产日期")} required>
            <input
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </Field>
          <Field label={t("本次排产数量")}>
            <input
              value={form.quantity}
              inputMode="decimal"
              onChange={(event) => update("quantity", event.target.value)}
              placeholder={t("留空则按各订单数量")}
            />
          </Field>
          <Field label={t("员工姓名")} required>
            <select
              value={form.line}
              onChange={(event) => update("line", event.target.value)}
              disabled={!hasEmployeeOptions}
              required
            >
              {!hasEmployeeOptions ? <option value="">{t("暂无已注册员工")}</option> : null}
              {employeeOptions.map((employee) => (
                <option key={employee.userId || employee.value} value={employee.value}>
                  {employee.label}
                </option>
              ))}
            </select>
            {!hasEmployeeOptions ? (
              <small className="field-hint">{t("请先在手机端注册员工账号，并在电脑端授权为员工。")}</small>
            ) : null}
          </Field>
          <Field label={t("排产后进度")}>
            <select value={form.status} onChange={(event) => update("status", event.target.value)}>
              {productionScheduleStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("排产备注")}>
            <input
              value={form.note}
              onChange={(event) => update("note", event.target.value)}
              placeholder={t("例如：优先生产、等料")}
            />
          </Field>
        </div>

        <div className="production-order-list">
          {orders.map((order) => (
            <div className="production-order-row" key={order.id}>
              <div>
                <strong>{order.orderNo || order.product || order.id}</strong>
                <span>{order.product || t("未填写产品")}</span>
              </div>
              <small>
                {t("数量 {quantity}", {
                  quantity: normalizeCalculatedNumber(
                    parseNumericValue(order[orderRemainingQuantityField] || order.quantity),
                  ),
                })}
                {order.dueDate ? t(" · 交期 {date}", { date: order.dueDate }) : ""}
              </small>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose} disabled={saving}>
            {t("取消")}
          </button>
          <button
            className="primary-action compact"
            type="submit"
            disabled={saving || !form.date || !form.line}
          >
            <KanbanSquare size={17} />
            {saving ? t("保存中") : t("确认排产")}
          </button>
        </div>
      </form>
    </div>
  );
}
