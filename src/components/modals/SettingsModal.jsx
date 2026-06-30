import { useState } from "react";
import { useI18n } from "../../App.jsx";
import { normalizeLanguage, languageOptions, formatDateTimeForDisplay } from "../../lib/app-utils.jsx";
import { MobileDisplayFieldPicker } from "../MobileDisplayFieldPicker.jsx";
import { X, Save } from "lucide-react";

export function SettingsModal({
  settings,
  onClose,
  onSave,
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    companyName: settings.companyName || "",
    companyNameEn: settings.companyNameEn || "",
    companyAddress: settings.companyAddress || "",
    companyAddressEn: settings.companyAddressEn || "",
    companyPhone: settings.companyPhone || "",
    companyTaxNo: settings.companyTaxNo || settings.taxNo || "",
    defaultDueDays: settings.defaultDueDays || "7",
    orderNoPrefix: settings.orderNoPrefix || "",
    language: normalizeLanguage(settings.language),
  });
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">SYSTEM SETTINGS</p>
            <h3>{t("系统设置")}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("关闭")}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-section">
          <h4>{t("语言")}</h4>
          <div className="settings-grid">
            <label className="field">
              <span>{t("界面语言")}</span>
              <select value={form.language} onChange={(e) => update("language", e.target.value)}>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>{t("公司信息（用于送货单打印）")}</h4>
          <div className="settings-grid">
            <label className="field">
              <span>{t("公司名称")}</span>
              <input
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder={t("例如：XX泡沫包装有限公司")}
              />
            </label>
            <label className="field">
              <span>{t("公司名称")} (English)</span>
              <input
                value={form.companyNameEn}
                onChange={(e) => update("companyNameEn", e.target.value)}
                placeholder="e.g. XX FOAM PACKAGING CO.,LTD"
              />
            </label>
            <label className="field">
              <span>{t("联系电话")}</span>
              <input
                value={form.companyPhone}
                onChange={(e) => update("companyPhone", e.target.value)}
                placeholder={t("例如：0757-8888 8888")}
              />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>{t("公司地址")}</span>
              <input
                value={form.companyAddress}
                onChange={(e) => update("companyAddress", e.target.value)}
                placeholder={t("例如：佛山市南海区XX工业园")}
              />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>{t("公司地址")} (English)</span>
              <input
                value={form.companyAddressEn}
                onChange={(e) => update("companyAddressEn", e.target.value)}
                placeholder="e.g. XX Industrial Park, Nanhai, Foshan"
              />
            </label>
            <label className="field">
              <span>{t("税号")}</span>
              <input
                value={form.companyTaxNo}
                onChange={(e) => update("companyTaxNo", e.target.value)}
                placeholder={t("纳税人识别号")}
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>{t("订单默认设置")}</h4>
          <div className="settings-grid">
            <label className="field">
              <span>{t("默认交期天数（新增订单时交期=今天+N天）")}</span>
              <input
                type="number"
                value={form.defaultDueDays}
                onChange={(e) => update("defaultDueDays", e.target.value)}
                min="0"
                max="365"
              />
            </label>
            <label className="field">
              <span>{t("订单号前缀（自动生成，留空则不自动生成）")}</span>
              <input
                value={form.orderNoPrefix}
                onChange={(e) => update("orderNoPrefix", e.target.value)}
                placeholder={t("例如：KH-")}
              />
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose} disabled={saving}>
            {t("取消")}
          </button>
          <button className="primary-action compact" type="submit" disabled={saving}>
            <Save size={17} />
            {saving ? t("保存中") : t("保存设置")}
          </button>
        </div>
      </form>
    </div>
  );
}
