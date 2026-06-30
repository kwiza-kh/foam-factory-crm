import { useMemo } from "react";
import { useI18n } from "../App.jsx";
import { summarizeCustomerOrders, formatCurrency } from "../lib/app-utils.jsx";

export function CustomerStatisticsPanel({ customers, onSelectCustomer }) {
  const { language, t } = useI18n();
  const rows = useMemo(
    () =>
      (customers || [])
        .map((customer) => ({
          customer,
          ...summarizeCustomerOrders(customer),
        }))
        .sort(
          (a, b) => b.orderAmount - a.orderAmount || a.customer.name.localeCompare(b.customer.name),
        ),
    [customers],
  );

  const total = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          orderAmount: acc.orderAmount + row.orderAmount,
          unfinishedOrders: acc.unfinishedOrders + row.unfinishedOrders,
          completedOrders: acc.completedOrders + row.completedOrders,
          statementAmount: acc.statementAmount + row.statementAmount,
          paidAmount: acc.paidAmount + row.paidAmount,
          unpaidAmount: acc.unpaidAmount + row.unpaidAmount,
        }),
        { orderAmount: 0, unfinishedOrders: 0, completedOrders: 0, statementAmount: 0, paidAmount: 0, unpaidAmount: 0 },
      ),
    [rows],
  );

  if (!rows.length) return null;

  const openCustomer = (customerId) => {
    if (customerId) onSelectCustomer(customerId);
  };

  return (
    <section className="customer-statistics-panel" aria-label={t("统计专区")}>
      <div className="statistics-head">
        <div>
          <p className="eyebrow">CUSTOMER STATISTICS</p>
          <h3>{t("统计专区")}</h3>
        </div>
        <span>{t("{count} 个客户", { count: rows.length })}</span>
      </div>
      <div className="statistics-table-wrap">
        <table className="statistics-table">
          <thead>
            <tr>
              <th>{t("客户")}</th>
              <th>{t("订单额")}</th>
              <th>{t("未完成订单")}</th>
              <th>{t("已完成订单")}</th>
              <th>{t("已做对账单金额")}</th>
              <th>{t("已付金额")}</th>
              <th>{t("未付金额")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.customer.id}
                tabIndex={0}
                onClick={() => openCustomer(row.customer.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCustomer(row.customer.id);
                  }
                }}
              >
                <td className="statistics-customer">{row.customer.name}</td>
                <td>{formatCurrency(row.orderAmount, language)}</td>
                <td>{row.unfinishedOrders}</td>
                <td>{row.completedOrders}</td>
                <td>{formatCurrency(row.statementAmount, language)}</td>
                <td>{formatCurrency(row.paidAmount, language)}</td>
                <td className={row.unpaidAmount > 0 ? "statistics-unpaid" : ""}>
                  {formatCurrency(row.unpaidAmount, language)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{t("合计")}</td>
              <td>{formatCurrency(total.orderAmount, language)}</td>
              <td>{total.unfinishedOrders}</td>
              <td>{total.completedOrders}</td>
              <td>{formatCurrency(total.statementAmount, language)}</td>
              <td>{formatCurrency(total.paidAmount, language)}</td>
              <td>{formatCurrency(total.unpaidAmount, language)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
