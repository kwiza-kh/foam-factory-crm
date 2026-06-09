import { useRef } from 'react';
import { Printer, X } from 'lucide-react';

export function DeliveryPrintModal({ delivery, customer, onClose, t = (text, vars) => String(text ?? "").replace(/\{(\w+)\}/g, (match, key) => (
  Object.prototype.hasOwnProperty.call(vars || {}, key) ? String(vars[key]) : match
)) }) {
  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${t("送货单 {deliveryNo}", { deliveryNo: delivery.deliveryNo })}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 14px; color: #111; padding: 32px; }
    .dn-title { text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .dn-subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 24px; }
    .dn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; }
    .dn-field { display: flex; gap: 8px; }
    .dn-label { color: #555; white-space: nowrap; }
    .dn-value { font-weight: 500; }
    .dn-divider { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
    .dn-sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 40px; }
    .dn-sign-box { border-top: 1px solid #aaa; padding-top: 8px; font-size: 12px; color: #555; }
    .dn-sign-box span { display: block; margin-bottom: 24px; }
  </style>
</head>
<body>${content}</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" style={{ width: 600, maxWidth: '95vw' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{t("送货单预览")}</p>
            <h3>{delivery.deliveryNo}</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Print content */}
        <div ref={printRef} style={{ padding: '16px 4px', lineHeight: 1.8 }}>
          <div className="dn-title">{customer.name}</div>
          <div className="dn-subtitle">{t("送货单")}</div>

          <div className="dn-grid">
            <div className="dn-field">
              <span className="dn-label">{t("送货单号")}：</span>
              <span className="dn-value">{delivery.deliveryNo}</span>
            </div>
            <div className="dn-field">
              <span className="dn-label">{t("送货日期")}：</span>
              <span className="dn-value">{delivery.date || '—'}</span>
            </div>
            <div className="dn-field">
              <span className="dn-label">{t("关联订单")}：</span>
              <span className="dn-value">{delivery.orderNo || '—'}</span>
            </div>
            <div className="dn-field">
              <span className="dn-label">{t("件数")}：</span>
              <span className="dn-value">{delivery.packages ?? '—'}</span>
            </div>
            <div className="dn-field">
              <span className="dn-label">{t("收货人")}：</span>
              <span className="dn-value">{delivery.receiver || '—'}</span>
            </div>
            <div className="dn-field">
              <span className="dn-label">{t("送货状态")}：</span>
              <span className="dn-value">{delivery.status ? t(delivery.status) : '—'}</span>
            </div>
            <div className="dn-field" style={{ gridColumn: '1 / -1' }}>
              <span className="dn-label">{t("送货地址")}：</span>
              <span className="dn-value">{delivery.address || '—'}</span>
            </div>
            {delivery.signedNote && (
              <div className="dn-field" style={{ gridColumn: '1 / -1' }}>
                <span className="dn-label">{t("签收备注")}：</span>
                <span className="dn-value">{delivery.signedNote}</span>
              </div>
            )}
          </div>

          <hr className="dn-divider" />

          <div className="dn-sign">
            <div className="dn-sign-box"><span>{t("发货方签名")}</span></div>
            <div className="dn-sign-box"><span>{t("收货方签名")}</span></div>
            <div className="dn-sign-box"><span>{t("签收日期")}</span></div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>{t("关闭")}</button>
          <button className="primary-action compact" type="button" onClick={handlePrint}>
            <Printer size={15} />
            {t("打印 / 导出 PDF")}
          </button>
        </div>
      </div>
    </div>
  );
}
