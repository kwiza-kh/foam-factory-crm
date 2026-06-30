import { useState, useEffect } from "react";
import { useI18n } from "../../App.jsx";
import { Field } from "../Field.jsx";
import { toFieldKey, normalizeFormulaInput, getCustomerViewColumns } from "../../lib/app-utils.jsx";
import { tableConfigs } from "../../config/tableConfigs.js";
import { X } from "lucide-react";

export function ColumnModal({
  tableKey,
  sourceTableKey = tableKey,
  customer,
  onClose,
  onAddColumn,
  onUpdateColumn,
  onRemoveColumn,
  onShowColumns,
}) {
  const { t } = useI18n();
  const [headerName, setHeaderName] = useState("");
  const [type, setType] = useState("text");
  const [formula, setFormula] = useState("");
  const [formulaDrafts, setFormulaDrafts] = useState({});
  const derivedView = sourceTableKey !== tableKey;
  const sourceCustomColumns = customer.customColumns?.[sourceTableKey] || [];
  const viewCustomColumns = derivedView
    ? customer.customColumns?.[tableKey] || []
    : sourceCustomColumns;
  const customColumns = viewCustomColumns;
  const config = tableConfigs[tableKey];
  const visibleFieldSet = new Set(
    getCustomerViewColumns(customer, tableKey).map((c) => c.field),
  );
  const hiddenSourceColumns = derivedView
    ? sourceCustomColumns.filter((c) => !visibleFieldSet.has(c.field))
    : [];
  const visibleSourceColumns = derivedView
    ? sourceCustomColumns.filter((c) => visibleFieldSet.has(c.field))
    : [];

  useEffect(() => {
    setFormulaDrafts(
      Object.fromEntries(
        customColumns.map((c) => [c.field, normalizeFormulaInput(c.formula)]),
      ),
    );
  }, [customColumns]);

  const commitFormula = (column) => {
    if (!onUpdateColumn) return;
    const nextFormula = normalizeFormulaInput(formulaDrafts[column.field]);
    if (nextFormula === normalizeFormulaInput(column.formula)) return;
    onUpdateColumn(tableKey, column.field, { formula: nextFormula || undefined });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!headerName.trim()) return;
    const normalizedFormula = normalizeFormulaInput(formula);
    onAddColumn(tableKey, {
      field: toFieldKey(headerName),
      headerName: headerName.trim(),
      type: normalizedFormula ? "number" : type,
      width: normalizedFormula || type === "number" ? 120 : 140,
      formula: normalizedFormula || undefined,
    });
    setHeaderName("");
    setType("text");
    setFormula("");
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card small" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CUSTOM TABLE HEADER</p>
            <h3>
              {customer.name} · {t(config.label)}
            </h3>
            {derivedView ? (
              <span className="settings-empty">
                {t("当前只调整这个业务视图，不会删除来源表表头。")}
              </span>
            ) : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("关闭")}>
            <X size={18} />
          </button>
        </div>

        <div className="column-manager">
          <div>
            <h4>{t("默认表头")}</h4>
            <div className="tag-wrap">
              {config.defaultColumns.map((c) => (
                <span className="column-tag locked" key={c.field}>
                  {t(c.headerName)}
                </span>
              ))}
            </div>
          </div>

          {derivedView && (
            <div>
              <h4>{t("来源表自定义表头")}</h4>
              <div className="formula-input-list">
                {visibleSourceColumns.length ? (
                  visibleSourceColumns.map((c) => (
                    <div className="column-formula-row" key={`source-${c.field}`}>
                      <div className="column-formula-name">
                        <span>{c.headerName}</span>
                        <small>{t("来源表")}</small>
                      </div>
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={() => onRemoveColumn(tableKey, c.field)}
                        title={t("仅从当前视图隐藏，不删除来源表字段")}
                      >
                        {t("隐藏")}
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="muted-text">{t("暂无来源表自定义表头")}</span>
                )}
              </div>
            </div>
          )}

          <div>
            <h4>{derivedView ? t("当前视图自定义表头") : t("当前客户自定义表头")}</h4>
            <div className="formula-input-list">
              {customColumns.length ? (
                customColumns.map((c) => (
                  <div className="column-formula-row" key={c.field}>
                    <div className="column-formula-name">
                      <span>{c.headerName}</span>
                      {normalizeFormulaInput(c.formula) ? <small>{t("公式")}</small> : null}
                    </div>
                    <input
                      className="column-formula-input"
                      value={formulaDrafts[c.field] ?? ""}
                      onChange={(event) =>
                        setFormulaDrafts((current) => ({
                          ...current,
                          [c.field]: event.target.value,
                        }))
                      }
                      onBlur={() => commitFormula(c)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.currentTarget.blur();
                      }}
                      placeholder={t("=采购数量*单价")}
                      aria-label={`${c.headerName}${t("公式")}`}
                    />
                    <button
                      className="icon-button column-delete-button"
                      type="button"
                      onClick={() => onRemoveColumn(tableKey, c.field)}
                      title={t("删除该自定义表头")}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <span className="muted-text">{t("暂无自定义表头")}</span>
              )}
            </div>
          </div>

          {derivedView && hiddenSourceColumns.length > 0 && (
            <div>
              <h4>{t("已隐藏的来源表头")}</h4>
              <div className="tag-wrap">
                {hiddenSourceColumns.map((c) => (
                  <button
                    className="column-tag"
                    key={`hidden-${c.field}`}
                    type="button"
                    onClick={() => onShowColumns?.(tableKey, [c.field])}
                    title={t("恢复到当前视图")}
                  >
                    {c.headerName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="add-column-row">
            <Field label={t("新表头名称")}>
              <input
                value={headerName}
                onChange={(event) => setHeaderName(event.target.value)}
                placeholder={t("例如：图纸编号、模具费、司机")}
              />
            </Field>
            <Field label={t("类型")}>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="text">{t("文本")}</option>
                <option value="number">{t("数字")}</option>
                <option value="date">{t("日期")}</option>
                <option value="select">{t("单选")}</option>
              </select>
            </Field>
            <Field label={t("公式（可选）")}>
              <input
                value={formula}
                onChange={(event) => setFormula(event.target.value)}
                placeholder={t("=数量*单价")}
              />
            </Field>
            <div className="add-column-action">
              <button
                className="primary-action compact"
                type="submit"
                disabled={!headerName.trim()}
              >
                {t("添加表头")}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            {t("关闭")}
          </button>
        </div>
      </form>
    </div>
  );
}
