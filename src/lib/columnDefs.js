import { statusOptions } from "./statusWorkflow.js";

const orderDefaultColumns = [
  {
    field: "status",
    headerName: "进度",
    width: 130,
    type: "select",
    options: statusOptions,
    editable: false,
  },
  {
    field: "completionTime",
    headerName: "完成时间",
    width: 170,
    type: "datetime",
    editable: false,
  },
  { field: "completionOperator", headerName: "员工姓名", width: 120, editable: false },
  { field: "completionPhoto", headerName: "照片证明", width: 130, type: "image", editable: false },
  {
    field: "statusChangedAt",
    headerName: "进度更新时间",
    width: 170,
    type: "datetime",
    editable: false,
  },
  { field: "statusChangeLog", headerName: "进度记录", width: 220, editable: false },
];
const deliveryQuantityField = "deliveryQuantity";
const orderDeliveredQuantityField = "deliveredQuantity";
const orderRemainingQuantityField = "remainingQuantity";
const finalDeliveryField = "_finalDelivery";
const linkedOrderIdField = "_linkedOrderId";
const linkedOrderQuantitySourceField = "_linkedOrderQuantitySourceField";
const deliveryOrderFieldPrefix = "order_";
const finalDeliveryStatusOptions = ["未送", "部分签收", "已签收", "作废"];
const productionScheduleStatusOptions = ["已排产"];
const orderDeliveryTrackingColumns = [
  { field: orderDeliveredQuantityField, headerName: "已送数量", width: 110, type: "number" },
  { field: orderRemainingQuantityField, headerName: "剩余数量", width: 110, type: "number" },
];
const productionScheduleDateField = "productionDate";
const productionScheduleQuantityField = "productionQuantity";
const productionLineField = "productionLine";
const productionNoteField = "productionNote";
const productionScheduleColumns = [
  { field: productionScheduleDateField, headerName: "排产日期", width: 130, type: "date" },
  { field: productionScheduleQuantityField, headerName: "排产数量", width: 110, type: "number" },
  { field: productionLineField, headerName: "员工姓名", width: 120 },
  { field: productionNoteField, headerName: "排产备注", flex: 1, minWidth: 160 },
];
const deliveryQuantityColumn = {
  field: deliveryQuantityField,
  headerName: "送货数量",
  width: 110,
  type: "number",
};
const knownOrderDataColumns = [
  { field: "orderNo", headerName: "订单号", width: 140 },
  { field: "date", headerName: "订单日期", width: 130, type: "date" },
  { field: "product", headerName: "产品", width: 150 },
  { field: "quantity", headerName: "订单数量", width: 110, type: "number" },
  { field: "amount", headerName: "金额", width: 120, type: "number" },
  { field: "dueDate", headerName: "交期", width: 130, type: "date" },
  { field: "followUp", headerName: "跟进记录", flex: 1, minWidth: 180 },
];

export {
  orderDefaultColumns,
  deliveryQuantityField,
  orderDeliveredQuantityField,
  orderRemainingQuantityField,
  finalDeliveryField,
  linkedOrderIdField,
  linkedOrderQuantitySourceField,
  deliveryOrderFieldPrefix,
  finalDeliveryStatusOptions,
  productionScheduleStatusOptions,
  orderDeliveryTrackingColumns,
  productionScheduleDateField,
  productionScheduleQuantityField,
  productionLineField,
  productionNoteField,
  productionScheduleColumns,
  deliveryQuantityColumn,
  knownOrderDataColumns,
};
