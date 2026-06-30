import { useI18n } from "../App.jsx";
import { normalizeOrderStatus, statusClass } from "../lib/app-utils.jsx";
import { statusOptions } from "../lib/statusWorkflow.js";

export function KanbanBoard({ customer, onStatusChange, onSelectOrder }) {
  const { t } = useI18n();
  const orders = (customer.orders || []).filter((o) => normalizeOrderStatus(o.status) !== "已付款");
  const columns = statusOptions.filter((s) => s !== "已付款");
  const ordersByStatus = Object.fromEntries(columns.map((s) => [s, []]));
  for (const order of orders) {
    const s = normalizeOrderStatus(order.status);
    if (ordersByStatus[s]) ordersByStatus[s].push(order);
  }

  return (
    <div className="kanban-board">
      {columns.map((status) => (
        <div className="kanban-column" key={status}>
          <div className="kanban-column-header">
            <span className={`status-chip ${statusClass(status)}`} style={{ fontSize: 12 }}>
              {t(status)}
            </span>
            <span className="count">{ordersByStatus[status]?.length || 0}</span>
          </div>
          <div className="kanban-column-body">
            {ordersByStatus[status]?.map((order) => (
              <div
                className="kanban-card"
                key={order.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("orderId", order.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const orderId = e.dataTransfer.getData("orderId");
                  if (orderId) onStatusChange(orderId, status);
                }}
                onClick={() => onSelectOrder(order.id)}
              >
                <strong>{order.orderNo || order.product}</strong>
                <small>
                  {order.product || ""} · {order.quantity || 0} {t("件")}
                </small>
                <small>{order.dueDate ? t("交期 {date}", { date: order.dueDate }) : ""}</small>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
