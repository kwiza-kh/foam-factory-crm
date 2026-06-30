import { useI18n } from "../App.jsx";

export function InfoPill({ label, value, wide = false }) {
  const { t } = useI18n();
  return (
    <div className={`info-pill ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value || t("未填写")}</strong>
    </div>
  );
}
