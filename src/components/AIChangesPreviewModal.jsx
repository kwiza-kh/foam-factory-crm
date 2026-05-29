import { Check, X } from 'lucide-react';

const TABLE_LABELS = { products: '产品', orders: '订单', deliveries: '送货单' };
const ACTION_LABELS = { update: '修改', add: '新增', delete: '删除' };
const ACTION_COLORS = { update: 'var(--amber)', add: 'var(--lime)', delete: 'var(--red)' };

export function AIChangesPreviewModal({ changes, customer, onConfirm, onClose }) {
  const getRow = (table, id) => customer[table]?.find(r => r.id === id);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card small">
        <div className="modal-head">
          <div>
            <p className="eyebrow">变更预览</p>
            <h3>即将应用 {changes.length} 条变更</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {changes.map((change, i) => {
            const existing = change.id ? getRow(change.table, change.id) : null;
            return (
              <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ color: ACTION_COLORS[change.action], fontWeight: 600 }}>
                    {ACTION_LABELS[change.action]}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{TABLE_LABELS[change.table]}</span>
                  {change.id && <span style={{ color: 'var(--muted)', fontSize: 11 }}>#{change.id}</span>}
                </div>

                {change.action === 'update' && change.patch &&
                  Object.entries(change.patch).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--muted)' }}>{k}：</span>
                      {existing?.[k] !== undefined && (
                        <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{String(existing[k])}</span>
                      )}
                      <span style={{ color: 'var(--lime)' }}>→ {String(v)}</span>
                    </div>
                  ))
                }
                {change.action === 'add' && (
                  <span style={{ color: 'var(--lime)', wordBreak: 'break-all' }}>
                    {JSON.stringify(change.row)}
                  </span>
                )}
                {change.action === 'delete' && (
                  <span style={{ color: 'var(--red)' }}>
                    删除：{existing
                      ? (existing.name || existing.orderNo || existing.deliveryNo || change.id)
                      : change.id}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-action compact" type="button" onClick={() => onConfirm(changes)}>
            <Check size={15} />
            确认应用
          </button>
        </div>
      </div>
    </div>
  );
}
