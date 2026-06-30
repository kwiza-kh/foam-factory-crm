import { useMemo } from "react";
import { useI18n } from "@/lib/I18nContext.jsx";
import {
  isOpenOrder,
  normalizeOrderStatus,
  closedOrderStatuses,
} from "../lib/app-utils.jsx";
import {
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  Truck,
  DollarSign,
  Clock,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const surfaceClass = "!border-[#314155] !bg-[#18212F] !shadow-none";
const panelHoverClass = "hover:bg-[#202B3A]";
const textMutedClass = "text-[#CBD5E1]";
const accentColor = "#14B8A6";
const chartPalette = ["#14B8A6", "#38BDF8", "#F59E0B", "#A3E635", "#F87171"];
const tooltipStyle = {
  background: "#18212F",
  border: "1px solid #314155",
  borderRadius: 8,
  fontSize: 12,
  color: "#F8FAFC",
};

/* KPI Card */
function KpiCard({ title, value, trend, trendLabel, icon: Icon, trendUp = true }) {
  return (
    <Card className={surfaceClass}>
      <CardContent className="!p-6">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[13px] ${textMutedClass}`}>{title}</span>
          <Icon size={20} className="text-[#14B8A6]" />
        </div>
        <div className="text-[28px] font-bold text-white mb-2">{value}</div>
        <div className="flex items-center gap-1.5 text-[12px]">
          {trend != null && (
            <>
              {trendUp ? (
                <TrendingUp size={14} className="text-[#10B981]" />
              ) : (
                <TrendingDown size={14} className="text-[#EF4444]" />
              )}
              <span className={trendUp ? "text-[#10B981]" : "text-[#EF4444]"}>
                {trend > 0 ? "+" : ""}{trend}{trendLabel ? ` ${trendLabel}` : ""}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* Status Badge */
function StatusBadge({ status }) {
  const colors = {
    open: "bg-[#14B8A6]/10 text-[#2DD4BF] border-[#14B8A6]/25",
    completed: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    cancelled: "bg-[#475569]/35 text-[#CBD5E1] border-[#475569]",
    warning: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  };
  const color = colors[status] || colors.open;
  return (
    <Badge variant="outline" className={`text-[11px] px-2 py-0 h-5 ${color}`}>
      {status}
    </Badge>
  );
}

/* ── Main Dashboard ── */
export function DashboardView({ customers, alertMap, onCreateCustomer, onSelectCustomer }) {
  const { t } = useI18n();

  /* KPIs */
  const kpis = useMemo(() => {
    const allOrders = customers.flatMap((c) => c.orders || []);
    const openOrders = allOrders.filter((o) => isOpenOrder(o.status));
    const deliveries = customers.flatMap((c) => c.deliveries || []);
    const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

    return {
      totalRevenue: `¥${(totalRevenue / 10000).toFixed(1)}万`,
      activeOrders: openOrders.length,
      totalCustomers: customers.length,
      activeDeliveries: deliveries.filter((d) => !d._finalDelivery).length,
    };
  }, [customers]);

  /* Monthly chart data */
  const monthlyData = useMemo(() => {
    const months = ["1月", "2月", "3月", "4月", "5月", "6月"];
    const now = new Date();
    return months.map((m, i) => {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - 4 + i, 0);
      const orders = customers
        .flatMap((c) => c.orders || [])
        .filter((o) => {
          if (!o.date) return false;
          const d = new Date(o.date);
          return d >= monthStart && d <= monthEnd;
        });
      return {
        name: m,
        orders: orders.length,
        target: 8 + i * 3,
      };
    });
  }, [customers]);

  /* Status distribution */
  const statusData = useMemo(() => {
    const allOrders = customers.flatMap((c) => c.orders || []);
    const counts = {};
    for (const o of allOrders) {
      const s = normalizeOrderStatus(o.status);
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [customers]);

  /* Recent orders */
  const recentOrders = useMemo(() => {
    return customers
      .flatMap((c) => (c.orders || []).map((o) => ({ ...o, customerName: c.name, customerId: c.id })))
      .filter((o) => o.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [customers]);

  /* Recent activity */
  const recentActivity = useMemo(() => {
    const items = [];
    for (const c of customers) {
      for (const o of c.orders || []) {
        if (o.completionTime) {
          items.push({
            type: "completed",
            user: o.completionOperator || "系统",
            action: `完成订单 ${o.orderNo || o.product}`,
            customer: c.name,
            time: o.completionTime,
          });
        }
      }
    }
    return items
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 5);
  }, [customers]);

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
        <Package size={48} className="text-[#475569]" />
        <p className="text-[#CBD5E1] text-base">{t("暂无客户数据")}</p>
        <Button onClick={onCreateCustomer} size="sm">
          <UserRoundPlus size={16} data-icon="inline-start" />
          {t("创建第一个客户")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-8 h-full overflow-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t("运营仪表盘")}</h1>
          <p className="text-[13px] text-[#CBD5E1] mt-1">
            {t("{customers} 个客户 · {orders} 个进行中订单", {
              customers: customers.length,
              orders: kpis.activeOrders,
            })}
          </p>
        </div>
        <Button onClick={onCreateCustomer} size="sm" className="h-9">
          <UserRoundPlus size={16} data-icon="inline-start" />
          {t("新增客户")}
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title={t("总营收")}
          value={kpis.totalRevenue}
          trend={12.5}
          trendLabel="%"
          icon={DollarSign}
          trendUp
        />
        <KpiCard
          title={t("进行中订单")}
          value={kpis.activeOrders}
          trend={8}
          trendLabel={t("较上周")}
          icon={Package}
          trendUp
        />
        <KpiCard
          title={t("客户总数")}
          value={kpis.totalCustomers}
          trend={customers.length}
          trendLabel={t("本月新增")}
          icon={Users}
          trendUp
        />
        <KpiCard
          title={t("活跃送货单")}
          value={kpis.activeDeliveries}
          trend={-2}
          trendLabel="%"
          icon={Truck}
          trendUp={false}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Line Chart */}
        <Card className={`${surfaceClass} col-span-2`}>
          <CardHeader className="!pb-2">
            <CardTitle className="text-sm text-white">{t("月度订单趋势")}</CardTitle>
          </CardHeader>
          <CardContent className="!pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#314155" vertical={false} />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke={accentColor}
                  strokeWidth={2}
                  dot={{ r: 4, fill: accentColor }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  stroke="#64748B"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className={surfaceClass}>
          <CardHeader className="!pb-2">
            <CardTitle className="text-sm text-white">{t("订单状态分布")}</CardTitle>
          </CardHeader>
          <CardContent className="!pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2">
              {statusData.map((s, i) => (
                <div key={s.name} className="flex items-center gap-1.5 text-[12px] text-[#CBD5E1]">
                  <span
                    className="size-2 rounded-full"
                    style={{
                      background: chartPalette[i % chartPalette.length],
                    }}
                  />
                  {s.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: Lists ── */}
      <div className="grid grid-cols-5 gap-4">
        {/* Top Orders */}
        <Card className={`${surfaceClass} col-span-3`}>
          <CardHeader className="!pb-3">
            <CardTitle className="text-sm text-white">{t("最近订单")}</CardTitle>
          </CardHeader>
          <CardContent className="!pt-0">
            {recentOrders.length === 0 ? (
              <p className="text-[13px] text-[#CBD5E1] py-4 text-center">{t("暂无订单")}</p>
            ) : (
              <div className="flex flex-col">
                {recentOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelectCustomer(order.customerId)}
                    className={`flex items-center gap-4 py-3 px-2 -mx-2 rounded-lg ${panelHoverClass} transition-colors text-left`}
                  >
                    <div className="size-9 rounded-full bg-[#14B8A6]/10 flex items-center justify-center shrink-0">
                      <span className="text-[12px] font-semibold text-[#2DD4BF]">
                        {(order.customerName || "?")[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white truncate">
                        {order.customerName}
                      </div>
                      <div className="text-[12px] text-[#CBD5E1]">
                        {order.product || order.orderNo}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] text-white font-medium">
                        ¥{(Number(order.amount) || 0).toLocaleString()}
                      </div>
                      <StatusBadge status={normalizeOrderStatus(order.status)} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className={`${surfaceClass} col-span-2`}>
          <CardHeader className="!pb-3">
            <CardTitle className="text-sm text-white">{t("最近动态")}</CardTitle>
          </CardHeader>
          <CardContent className="!pt-0">
            {recentActivity.length === 0 ? (
              <p className="text-[13px] text-[#CBD5E1] py-4 text-center">{t("暂无动态")}</p>
            ) : (
              <div className="flex flex-col">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <div className="size-8 rounded-full bg-[#202B3A] flex items-center justify-center shrink-0 mt-0.5">
                      <Clock size={14} className="text-[#CBD5E1]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[#CBD5E1]">
                        <span className="text-white font-medium">{item.user}</span>
                        {" "}{item.action}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] mt-0.5">
                        {item.customer} · {item.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
