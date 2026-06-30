import { useState } from "react";
import { useI18n } from "../../App.jsx";
import { normalizeMobileDisplaySettings, defaultMobileDisplaySettings } from "../../lib/app-utils.jsx";
import { MobileDisplayFieldPicker } from "../MobileDisplayFieldPicker.jsx";
import { X, Save } from "lucide-react";

export function MobileDisplaySettingsModal({
  customerName = "",
  mobileDisplaySettings = defaultMobileDisplaySettings,
  mobileOrderFieldOptions = [],
  onClose,
  onSave,
}) {
  const { t } = useI18n();
  const [displayForm, setDisplayForm] = useState(() =>
    normalizeMobileDisplaySettings(mobileDisplaySettings),
  );
  const [saving, setSaving] = useState(false);

  const toggleDisplayField = (group, field) => {
    setDisplayForm((current) => {
      const list = current[group] || [];
      return {
        ...current,
        [group]: list.includes(field) ? list.filter((item) => item !== field) : [...list, field],
      };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(displayForm);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">MOBILE FIELDS</p>
            <h3>{t("排产看板手机字段")}</h3>
            {customerName ? (
              <span className="settings-empty">
                {t("当前客户：{name}", { name: customerName })}
              </span>
            ) : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("关闭")}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-section">
          <h4>{t("手机端排产订单字段显示")}</h4>
          <p className="settings-empty">
            {t("这些字段只会用于当前客户的手机端排产订单卡片和订单详情。")}
          </p>
          <MobileDisplayFieldPicker
            title={t("订单卡片显示字段")}
            fields={displayForm.cardFields}
            options={mobileOrderFieldOptions}
            onToggle={(field) => toggleDisplayField("cardFields", field)}
          />
          <MobileDisplayFieldPicker
            title={t("订单详情显示字段")}
            fields={displayForm.detailFields}
            options={mobileOrderFieldOptions}
            onToggle={(field) => toggleDisplayField("detailFields", field)}
          />
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
