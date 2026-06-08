import { Boxes, ClipboardList, KanbanSquare, Truck } from "lucide-react";
import { materialOptions, unitOptions } from "../lib/statusWorkflow.js";
import {
  orderDefaultColumns,
  productionScheduleColumns,
  finalDeliveryField,
  finalDeliveryStatusOptions,
} from "../lib/columnDefs.js";

const tableConfigs = {
  products: {
    label: "产品录入",
    icon: Boxes,
    rowLabel: "产品",
    defaultColumns: [
      { field: "name", headerName: "产品名称", width: 150, required: true },
      { field: "spec", headerName: "规格尺寸", width: 150 },
      { field: "material", headerName: "泡沫材质", width: 130, type: "select", options: materialOptions },
      { field: "unit", headerName: "单位", width: 90, type: "select", options: unitOptions },
      {
        field: "unitPrice",
        headerName: "单价",
        width: 110,
        type: "number",
      },
      { field: "moq", headerName: "起订量", width: 110, type: "number" },
      { field: "remark", headerName: "备注", flex: 1, minWidth: 160 },
    ],
    emptyRow: {
      name: "新泡沫产品",
      spec: "",
      material: "EPS",
      unit: "件",
      unitPrice: 0,
      moq: 0,
      remark: "",
    },
  },
  orders: {
    label: "订单录入 / 跟进",
    icon: ClipboardList,
    rowLabel: "订单",
    defaultColumns: orderDefaultColumns,
    emptyRow: {
      orderNo: "",
      date: "",
      product: "",
      quantity: 0,
      amount: 0,
      dueDate: "",
      status: "未完成",
      followUp: "",
    },
  },
  productionSchedule: {
    label: "排产看板",
    icon: KanbanSquare,
    rowLabel: "排产订单",
    defaultColumns: [
      ...orderDefaultColumns,
      ...productionScheduleColumns,
    ],
    emptyRow: {},
    sourceTableKey: "orders",
    disableRowCreate: true,
  },
  historyOrders: {
    label: "历史订单",
    icon: ClipboardList,
    rowLabel: "历史订单",
    defaultColumns: orderDefaultColumns,
    emptyRow: {},
    sourceTableKey: "orders",
    readOnly: true,
  },
  deliveries: {
    label: "送货单草稿",
    icon: Truck,
    rowLabel: "送货单草稿",
    defaultColumns: [
      {
        field: "deliveryNo",
        headerName: "送货单号",
        width: 150,
        required: true,
      },
      { field: "date", headerName: "送货日期", width: 130, type: "date" },
    ],
    emptyRow: {
      deliveryNo: "",
      date: "",
      status: "未送",
      [finalDeliveryField]: false,
    },
  },
  finalDeliveries: {
    label: "送货单",
    icon: Truck,
    rowLabel: "送货单",
    defaultColumns: [
      {
        field: "deliveryNo",
        headerName: "送货单号",
        width: 150,
        required: true,
      },
      { field: "date", headerName: "送货日期", width: 130, type: "date" },
      {
        field: "status",
        headerName: "状态",
        width: 110,
        type: "select",
        options: finalDeliveryStatusOptions,
      },
    ],
    emptyRow: {},
    sourceTableKey: "deliveries",
    disableRowCreate: true,
  },
};

export { tableConfigs };
