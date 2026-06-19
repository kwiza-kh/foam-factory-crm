const statusOptions = ["未完成", "已排产", "已完成", "已开送货单", "部分送货", "已送货", "已开对账单", "已付款", "异常"];
const closedOrderStatuses = new Set(["已完成", "已开送货单", "部分送货", "已送货", "已开对账单", "已付款", "已发货", "异常"]);
const isOpenOrder = (status = "") => !closedOrderStatuses.has(status);
const normalizeOrderStatus = (status = "") => {
  if (statusOptions.includes(status)) return status;
  if (status === "已发货") return "已送货";
  return "未完成";
};
const statusTransitions = {
  "未完成": ["已排产", "已完成"],
  "已排产": ["已完成"],
  "已完成": ["已开送货单"],
  "已开送货单": ["部分送货", "已送货", "异常"],
  "部分送货": ["已开送货单", "已送货", "异常"],
  "已送货": ["已开对账单"],
  "已开对账单": ["已付款"],
  "已付款": [],
  "异常": ["未完成"],
};
const getNextStatuses = (currentStatus) => {
  const normalized = normalizeOrderStatus(currentStatus);
  return statusTransitions[normalized] || [];
};
const deliveryStatusOptions = ["待装车", "配送中", "已签收", "回单异常"];
const customerLevelOptions = ["重点客户", "稳定客户", "新客户", "暂停合作"];
const materialOptions = ["EPS", "EPE", "EPP", "珍珠棉", "海绵", "其他"];
const unitOptions = ["件", "套", "箱", "个", "㎡", "m³", "kg"];

export {
  statusOptions,
  closedOrderStatuses,
  isOpenOrder,
  normalizeOrderStatus,
  statusTransitions,
  getNextStatuses,
  deliveryStatusOptions,
  customerLevelOptions,
  materialOptions,
  unitOptions,
};
