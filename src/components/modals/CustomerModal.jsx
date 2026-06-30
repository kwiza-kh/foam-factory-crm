import { useState } from "react";
import { useI18n } from "../../App.jsx";
import { Field } from "../Field.jsx";
import { customerLevelOptions } from "../../lib/app-utils.jsx";
import { X } from "lucide-react";

export function CustomerModal({ customer, customerGroups = customerLevelOptions, onClose, onSave }) {
  const { t } = useI18n();
  const [form, setForm] = useState(
    customer || {
      name: "",
      contact: "",
      phone: "",
      address: "",
      level: "新客户",
      paymentTerm: "",
      taxNo: "",
      note: "",
    },
  );

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">CUSTOMER PROFILE</p>
            <h3>{customer ? t("编辑客户档案") : t("新增客户档案")}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title={t("关闭")}>
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <Field label={t("客户名称")} required>
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder={t("例如：某某包装厂")}
            />
          </Field>
          <Field label={t("联系人")}>
            <input
              value={form.contact}
              onChange={(event) => update("contact", event.target.value)}
            />
          </Field>
          <Field label={t("联系电话")}>
            <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
          </Field>
          <Field label={t("地址")} wide>
            <input
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
              placeholder={t("例如：XX镇XX工业园")}
            />
          </Field>
          <Field label={t("客户分组")}>
            <select value={form.level} onChange={(event) => update("level", event.target.value)}>
              {customerGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("账期")}>
            <input
              value={form.paymentTerm}
              onChange={(event) => update("paymentTerm", event.target.value)}
              placeholder={t("例如：月结30天、现结")}
            />
          </Field>
          <Field label={t("税号")}>
            <input
              value={form.taxNo}
              onChange={(event) => update("taxNo", event.target.value)}
              placeholder={t("纳税人识别号")}
            />
          </Field>
          <Field label={t("备注")} wide>
            <textarea
              value={form.note}
              onChange={(event) => update("note", event.target.value)}
              placeholder={t("内部备注，客户不可见")}
              rows={3}
            />
          </Field>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="primary-action compact" type="submit">
            {customer ? t("保存修改") : t("创建客户")}
          </button>
        </div>
      </form>
    </div>
  );
}
