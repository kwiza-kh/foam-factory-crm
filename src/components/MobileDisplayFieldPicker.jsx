import { useI18n } from "../App.jsx";

export function MobileDisplayFieldPicker({ title, fields, options, onToggle }) {
  const { t } = useI18n();
  const selected = new Set(fields || []);
  return (
    <div className="mobile-display-picker">
      <div className="mobile-display-picker-head">
        <strong>{title}</strong>
        <span>{t("已选择 {count} 项", { count: selected.size })}</span>
      </div>
      <div className="mobile-display-field-list">
        {options.map((option) => {
          const active = selected.has(option.field);
          return (
            <button
              key={`${title}-${option.field}`}
              type="button"
              className={`mobile-display-field-chip ${active ? "active" : ""}`}
              onClick={() => onToggle(option.field)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
