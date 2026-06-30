import { useMemo, useState, useEffect } from "react";
import { useI18n } from "../App.jsx";
import { filterValue } from "../lib/app-utils.jsx";
import { normalizeOrderStatus } from "../lib/statusWorkflow.js";

export function ColumnValueFilter({ popup, rows, appliedValues, onApply, onClear, onClose }) {
  const { t } = useI18n();
  const values = useMemo(() => {
    const seen = new Set();
    const result = [];
    const addValue = (rawValue) => {
      const normalizedValue =
        popup.field === "status" && popup.optionValues?.includes("未完成")
          ? normalizeOrderStatus(rawValue)
          : rawValue;
      const value = filterValue(normalizedValue);
      if (seen.has(value.key)) return;
      seen.add(value.key);
      result.push(value);
    };

    if (popup.optionValues?.length) {
      popup.optionValues.forEach(addValue);
    }

    for (const row of rows) {
      addValue(row[popup.field]);
    }
    return popup.optionValues?.length
      ? result
      : result.sort((a, b) => a.label.localeCompare(b.label, "zh-CN", { numeric: true }));
  }, [popup.field, popup.optionValues, rows]);

  const [draftValues, setDraftValues] = useState(
    () => new Set(appliedValues ? Array.from(appliedValues) : values.map((v) => v.key)),
  );

  useEffect(() => {
    setDraftValues(
      new Set(appliedValues ? Array.from(appliedValues) : values.map((v) => v.key)),
    );
  }, [appliedValues, values]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const toggleValue = (key, checked) => {
    setDraftValues((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const getDisplayLabel = (value) =>
    value.key === "" || popup.field === "status" ? t(value.label) : value.label;

  return (
    <div className="column-filter-popover" style={{ left: popup.left, top: popup.top }}>
      <div className="column-filter-title">{popup.headerName}</div>
      <div className="column-filter-actions">
        <button
          type="button"
          onClick={() => setDraftValues(new Set(values.map((v) => v.key)))}
        >
          {t("全选")}
        </button>
        <button type="button" onClick={() => setDraftValues(new Set())}>
          {t("清空")}
        </button>
      </div>
      <div className="column-filter-options">
        {values.map((value) => (
          <label className="column-filter-option" key={value.key}>
            <input
              type="checkbox"
              checked={draftValues.has(value.key)}
              onChange={(event) => toggleValue(value.key, event.target.checked)}
            />
            <span title={getDisplayLabel(value)}>{getDisplayLabel(value)}</span>
          </label>
        ))}
      </div>
      <div className="column-filter-footer">
        <button type="button" onClick={() => onClear(popup.field)}>
          {t("重置")}
        </button>
        <button type="button" onClick={onClose}>
          {t("取消")}
        </button>
        <button
          className="is-primary"
          type="button"
          onClick={() => onApply(popup.field, draftValues, values)}
        >
          {t("确定")}
        </button>
      </div>
    </div>
  );
}
