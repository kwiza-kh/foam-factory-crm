import { Router } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../db.js";
import { findUserByMobileToken, normalizeMobileDisplaySettings, normalizeRole } from "./users.js";
import { bumpDataVersion } from "../syncVersion.js";
import { notifyProductionSchedulePublished } from "../pushNotifications.js";

const router = Router();
const VALID_TABLES = new Set([
  "products",
  "orders",
  "deliveries",
  "materialCosts",
  "costEntries",
  "statements",
  "payments",
]);
const TABLE_DELEGATES = {
  products: "product",
  orders: "order",
  deliveries: "delivery",
  materialCosts: "materialCost",
  costEntries: "costEntry",
  statements: "statement",
  payments: "payment",
};

function defaultCustomColumns() {
  return {
    products: [],
    orders: [],
    deliveries: [],
    materialCosts: [],
    costEntries: [],
    statements: [],
    payments: [],
  };
}

function normalizeCustomColumns(customColumns = {}) {
  return {
    ...defaultCustomColumns(),
    ...(customColumns || {}),
    columnOrder: customColumns?.columnOrder || {},
    mobileDisplaySettings: normalizeMobileDisplaySettings(customColumns?.mobileDisplaySettings),
  };
}

function makeRowId(tableKey) {
  return `${tableKey}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function uniqueRows(rows = [], tableKey, usedIds = new Set()) {
  return rows.map((row) => {
    let id = row?.id;
    while (!id || usedIds.has(id)) {
      id = makeRowId(tableKey);
    }
    usedIds.add(id);
    return id === row?.id ? row : { ...row, id };
  });
}

function normalizeIncomingCustomers(customers = []) {
  const usedIdsByTable = Object.fromEntries(
    Object.keys(TABLE_DELEGATES).map((tableKey) => [tableKey, new Set()]),
  );

  return customers.map((customer) => {
    const next = { ...customer };
    for (const tableKey of Object.keys(TABLE_DELEGATES)) {
      next[tableKey] = uniqueRows(customer[tableKey] || [], tableKey, usedIdsByTable[tableKey]);
    }
    return next;
  });
}

function normalize(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || "",
    phone: row.phone || "",
    address: row.address || "",
    level: row.level || "",
    paymentTerm: row.paymentTerm || "",
    taxNo: row.taxNo || "",
    note: row.note || "",
    customColumns: normalizeCustomColumns(row.customColumns),
    products: row.products?.map((item) => item.data) || [],
    orders: row.orders?.map((item) => item.data) || [],
    deliveries: row.deliveries?.map((item) => item.data) || [],
    materialCosts: row.materialCosts?.map((item) => item.data) || [],
    costEntries: row.costEntries?.map((item) => item.data) || [],
    statements: row.statements?.map((item) => item.data) || [],
    payments: row.payments?.map((item) => item.data) || [],
  };
}

function statementDeliveryIds(statement = {}) {
  if (Array.isArray(statement.deliveryIds)) return statement.deliveryIds.map(String);
  return String(statement.deliveryIds || "")
    .split(/[、,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function statementReferencesDelivery(statement = {}, deliveryId = "") {
  return statementDeliveryIds(statement).includes(String(deliveryId));
}

function isFinalDelivery(delivery = {}) {
  return delivery._finalDelivery === true;
}

function normalizeOrderStatus(status = "") {
  const value = String(status || "").trim();
  if (value === "已发货") return "已送货";
  return value || "未完成";
}

function countNewlyScheduledOrders(previousOrders = [], nextOrders = []) {
  const previousStatusById = new Map(
    previousOrders.map((order) => [String(order.id || ""), normalizeOrderStatus(order.status)]),
  );
  return nextOrders.filter((order) => {
    const orderId = String(order.id || "");
    if (normalizeOrderStatus(order.status) !== "已排产") return false;
    return previousStatusById.get(orderId) !== "已排产";
  }).length;
}

function normalizeFinalDeliveryStatus(status = "") {
  const value = String(status || "").trim();
  if (value === "部分签收" || value === "部分送货") return "部分签收";
  if (value === "已送" || value === "已送货" || value === "已发货" || value.includes("签收"))
    return "已签收";
  if (
    value === "作废" ||
    value.includes("作废") ||
    value.includes("取消") ||
    value.includes("无效")
  )
    return "作废";
  return value || "未送";
}

function isMobileVisibleDelivery(delivery = {}) {
  const finalDelivery = delivery._finalDelivery !== false;
  return finalDelivery && normalizeFinalDeliveryStatus(delivery.status) !== "作废";
}

function isDeliverySigned(delivery = {}) {
  return normalizeFinalDeliveryStatus(delivery.status) === "已签收" || Boolean(delivery.signedAt);
}

function isLockedDelivery(delivery = {}) {
  return (
    isFinalDelivery(delivery) &&
    (isDeliverySigned(delivery) || Boolean(delivery.statementNo || delivery.reconciledAt))
  );
}

function getDeleteBlockers(customer = {}, tableKey, ids = []) {
  const selectedIds = new Set(ids.map(String));
  const deliveries = customer.deliveries || [];
  const statements = customer.statements || [];
  const payments = customer.payments || [];
  const blockers = [];

  if (tableKey === "orders") {
    const hasLinkedDelivery = deliveries.some((delivery) =>
      selectedIds.has(String(delivery._linkedOrderId || "")),
    );
    if (hasLinkedDelivery) blockers.push("订单已生成送货单，不能直接删除");
  }

  if (tableKey === "deliveries") {
    const selectedDeliveries = deliveries.filter((delivery) =>
      selectedIds.has(String(delivery.id)),
    );
    const hasLockedDelivery = selectedDeliveries.some(
      (delivery) =>
        isLockedDelivery(delivery) ||
        statements.some((statement) => statementReferencesDelivery(statement, delivery.id)),
    );
    if (hasLockedDelivery) blockers.push("送货单已签收或已进入对账，不能直接删除");
  }

  if (tableKey === "statements") {
    const selectedStatements = statements.filter((statement) =>
      selectedIds.has(String(statement.id)),
    );
    const selectedStatementNos = new Set(
      selectedStatements
        .map((statement) => String(statement.statementNo || "").trim())
        .filter(Boolean),
    );
    const hasPayment = payments.some((payment) =>
      selectedStatementNos.has(String(payment.statementNo || "").trim()),
    );
    if (hasPayment) blockers.push("对账单已有收款记录，不能直接删除");

    const hasLinkedDelivery = selectedStatements.some(
      (statement) =>
        statementDeliveryIds(statement).length ||
        deliveries.some(
          (delivery) =>
            selectedStatementNos.has(String(delivery.statementNo || "").trim()) ||
            statementReferencesDelivery(statement, delivery.id),
        ),
    );
    if (hasLinkedDelivery) blockers.push("对账单已关联送货单，不能直接删除");
  }

  return blockers;
}

function assertRowsCanBeDeleted(customer, tableKey, ids = []) {
  const blockers = getDeleteBlockers(customer, tableKey, ids);
  if (!blockers.length) return;
  const err = new Error(blockers.join("\n"));
  err.statusCode = 409;
  throw err;
}

function getPaymentOverages(statements = [], payments = []) {
  const statementAmounts = new Map();
  for (const statement of statements || []) {
    const statementNo = String(statement.statementNo || "").trim();
    if (!statementNo) continue;
    statementAmounts.set(statementNo, parseNumericValue(statement.amount));
  }

  const paidByStatementNo = new Map();
  for (const payment of payments || []) {
    const statementNo = String(payment.statementNo || "").trim();
    if (!statementNo || !statementAmounts.has(statementNo)) continue;
    paidByStatementNo.set(
      statementNo,
      (paidByStatementNo.get(statementNo) || 0) + parseNumericValue(payment.amount),
    );
  }

  return Array.from(paidByStatementNo.entries())
    .map(([statementNo, paidAmount]) => {
      const amount = statementAmounts.get(statementNo) || 0;
      if (paidAmount <= amount + 0.0000001) return null;
      return { statementNo, amount, paidAmount, overAmount: paidAmount - amount };
    })
    .filter(Boolean);
}

function assertPaymentsWithinStatementAmounts(customer = {}, payments = []) {
  const overages = getPaymentOverages(customer.statements || [], payments);
  if (!overages.length) return;
  const err = new Error(
    `收款金额不能超过对账金额：${overages
      .slice(0, 5)
      .map((item) => item.statementNo)
      .join("、")}`,
  );
  err.statusCode = 409;
  throw err;
}

function assertDeliveryRowsCanBeSaved(customer = {}, deliveries = []) {
  const ordersById = new Set((customer.orders || []).map((order) => String(order.id)));
  const previousById = new Map(
    (customer.deliveries || []).map((delivery) => [delivery.id, delivery]),
  );

  for (const delivery of deliveries || []) {
    if (!isFinalDelivery(delivery)) continue;
    const linkedOrderId = String(delivery._linkedOrderId || "");
    const hasValidLinkedOrder = linkedOrderId && ordersById.has(linkedOrderId);
    if (hasValidLinkedOrder) continue;

    const previous = previousById.get(delivery.id);
    const previousLinkedOrderId = String(previous?._linkedOrderId || "");
    const wasLegacyUnlinkedFinal =
      previous?._finalDelivery === true &&
      (!previousLinkedOrderId || !ordersById.has(previousLinkedOrderId));
    if (wasLegacyUnlinkedFinal) continue;

    const err = new Error("正式送货单必须关联有效订单");
    err.statusCode = 409;
    throw err;
  }
}

function deliverySignItemId(delivery = {}) {
  return String(delivery.id || delivery._linkedOrderId || delivery.deliveryNo || "").trim();
}

function deliverySignItemLabel(delivery = {}) {
  return String(
    delivery.orderNo ||
      delivery.order_no ||
      delivery.product ||
      delivery._linkedOrderId ||
      delivery.id ||
      "送货明细",
  );
}

function normalizeDeliverySignItems(delivery = {}) {
  const existing = Array.isArray(delivery.signItems) ? delivery.signItems : [];
  if (existing.length) {
    return existing.map((item, index) => ({
      id: String(item.id || item.deliveryId || `${deliverySignItemId(delivery)}-${index}`),
      deliveryId: String(item.deliveryId || delivery.id || item.id || ""),
      label: String(item.label || item.orderNo || item.product || deliverySignItemLabel(delivery)),
      quantity: item.quantity ?? delivery.deliveryQuantity ?? "",
      unit: item.unit || delivery.unit || "",
      signed: Boolean(item.signed || item.signedAt),
      signedAt: item.signedAt || "",
      signedBy: item.signedBy || "",
      note: item.note || "",
    }));
  }
  return [
    {
      id: deliverySignItemId(delivery),
      deliveryId: String(delivery.id || ""),
      label: deliverySignItemLabel(delivery),
      quantity: delivery.deliveryQuantity ?? delivery.quantity ?? "",
      unit: delivery.unit || "",
      signed: isDeliverySigned(delivery),
      signedAt: delivery.signedAt || "",
      signedBy: delivery.signedBy || "",
      note: delivery.signedNote || "",
    },
  ];
}

function deliveryGroupKey(delivery = {}) {
  const data = delivery.data && typeof delivery.data === "object" ? delivery.data : delivery;
  return `${delivery.customerId || data.customerId || ""}:${data.deliveryNo || delivery.deliveryNo || data.id || delivery.id || ""}`;
}

function deliveryGroupSortOrder(delivery = {}) {
  return Number.isFinite(Number(delivery.sortOrder)) ? Number(delivery.sortOrder) : 0;
}

function applyDeliverySignState(deliveries = [], selectedItemIds = [], signMeta = {}) {
  const selected = new Set(
    selectedItemIds.map((item) => String(item || "").trim()).filter(Boolean),
  );
  const signAllWhenEmpty = selected.size === 0;
  const now = signMeta.signedAt || new Date().toISOString();
  const historyEntry = {
    id: `sign-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    signedAt: now,
    signedBy: signMeta.signer,
    note: signMeta.note || "",
    photo: signMeta.photo || null,
    signedUserId: signMeta.userId || "",
    signedUserName: signMeta.userName || "",
    itemIds: [],
  };

  const updated = deliveries.map((delivery) => {
    const items = normalizeDeliverySignItems(delivery);
    let changed = false;
    const nextItems = items.map((item) => {
      const shouldSign = !item.signed && (signAllWhenEmpty || selected.has(String(item.id)));
      if (!shouldSign) return item;
      changed = true;
      historyEntry.itemIds.push(String(item.id));
      return {
        ...item,
        signed: true,
        signedAt: now,
        signedBy: signMeta.signer,
        note: signMeta.note || item.note || "",
      };
    });
    const allSigned = nextItems.length > 0 && nextItems.every((item) => item.signed);
    const partiallySigned = nextItems.some((item) => item.signed);
    const signHistory = Array.isArray(delivery.signHistory) ? delivery.signHistory : [];
    const signedPatch = changed
      ? {
          signedAt: now,
          signedBy: signMeta.signer,
          signedNote: signMeta.note || "",
          signedPhoto: signMeta.photo || null,
          signedUserId: signMeta.userId || "",
          signedUserName: signMeta.userName || "",
        }
      : {
          signedAt: delivery.signedAt || "",
          signedBy: delivery.signedBy || "",
          signedNote: delivery.signedNote || "",
          signedPhoto: delivery.signedPhoto || null,
          signedUserId: delivery.signedUserId || "",
          signedUserName: delivery.signedUserName || "",
        };
    return {
      ...delivery,
      signItems: nextItems,
      ...(changed ? { signHistory: [...signHistory, historyEntry] } : {}),
      status: allSigned ? "已签收" : partiallySigned ? "部分签收" : "未送",
      ...(allSigned
        ? signedPatch
        : {
            signedAt: "",
            signedBy: "",
            signedNote: "",
            signedPhoto: null,
            signedUserId: "",
            signedUserName: "",
          }),
    };
  });

  return {
    deliveries: updated,
    signedItemIds: historyEntry.itemIds,
    allSigned: updated.every((delivery) =>
      normalizeDeliverySignItems(delivery).every((item) => item.signed),
    ),
    partiallySigned: updated.some((delivery) =>
      normalizeDeliverySignItems(delivery).some((item) => item.signed),
    ),
  };
}

function parseNumericValue(value) {
  const number = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(number) ? number : 0;
}

function deliveryQuantitySource(delivery = {}) {
  return delivery._linkedOrderQuantitySourceField || "quantity";
}

function appendAuditLog(log = "", message = "") {
  const line = `[${new Date().toLocaleString()}] ${message}`;
  return [String(log || "").trim(), line].filter(Boolean).join("\n");
}

function isSameMaterial(material = {}, input = {}) {
  const materialName = String(material.materialName || "").trim();
  const inputName = String(input.materialName || "").trim();
  if (!materialName || materialName !== inputName) return false;
  const materialUnit = String(material.unit || "").trim();
  const inputUnit = String(input.unit || "").trim();
  return !inputUnit || materialUnit === inputUnit;
}

function sanitizeMaterialCostForEmployee(material = {}) {
  return {
    id: material.id,
    materialName: material.materialName || "",
    unit: material.unit || "",
    remark: material.remark || "",
  };
}

function sanitizeCostEntryForEmployee(entry = {}) {
  return {
    id: entry.id,
    date: entry.date || "",
    materialName: entry.materialName || "",
    quantity: entry.quantity || 0,
    unit: entry.unit || "",
    note: entry.note || "",
    photo: entry.photo || "",
    approvalStatus: entry.approvalStatus || "待审核",
    enteredAt: entry.enteredAt || "",
    enteredBy: entry.enteredBy || "",
    enteredUserId: entry.enteredUserId || "",
    _restricted: true,
  };
}

function filterCustomerForMobileUser(customer, user) {
  const role = normalizeRole(user?.role);
  if (!user) return customer;
  if (role === "admin") {
    return {
      ...customer,
      statements: [],
      payments: [],
    };
  }
  if (role === "pending") {
    return {
      ...customer,
      products: [],
      deliveries: [],
      orders: [],
      materialCosts: [],
      costEntries: [],
      statements: [],
      payments: [],
    };
  }
  return {
    ...customer,
    products: [],
    deliveries: (customer.deliveries || []).filter(isMobileVisibleDelivery),
    materialCosts: (customer.materialCosts || []).map(sanitizeMaterialCostForEmployee),
    costEntries: (customer.costEntries || []).map(sanitizeCostEntryForEmployee),
    orders: (customer.orders || []).filter(
      (order) => normalizeOrderStatus(order.status) === "已排产",
    ),
  };
}

function hasMobileUserToken(req) {
  return Boolean(String(req.headers["x-mobile-user-token"] || req.query.mobileToken || "").trim());
}

// GET /api/customers?page=1&limit=50&search=xxx
router.get("/", async (req, res) => {
  try {
    const mobileUser = await findUserByMobileToken(req);
    if (hasMobileUserToken(req) && !mobileUser) {
      return res.status(401).json({ error: "手机账号不存在或已失效" });
    }
    const mobileRole = normalizeRole(mobileUser?.role);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();

    const where = search ? { name: { contains: search, mode: "insensitive" } } : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: {
          products: { orderBy: { sortOrder: "asc" } },
          orders: { orderBy: { sortOrder: "asc" } },
          deliveries: { orderBy: { sortOrder: "asc" } },
          materialCosts: { orderBy: { sortOrder: "asc" } },
          costEntries: { orderBy: { sortOrder: "asc" } },
          statements: { orderBy: { sortOrder: "asc" } },
          payments: { orderBy: { sortOrder: "asc" } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    const data = customers
      .map(normalize)
      .map((customer) =>
        mobileUser ? filterCustomerForMobileUser(customer, mobileUser) : customer,
      )
      .filter(
        (customer) =>
          !mobileUser ||
          mobileRole === "admin" ||
          customer.orders.length > 0 ||
          customer.materialCosts.length > 0 ||
          customer.costEntries.length > 0 ||
          customer.statements.length > 0 ||
          customer.payments.length > 0,
      );

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + customers.length < total,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/replace-all  (must be before /:id)
router.post("/replace-all", async (req, res) => {
  const customers = normalizeIncomingCustomers(req.body.customers || []);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany();
      await tx.statement.deleteMany();
      await tx.delivery.deleteMany();
      await tx.order.deleteMany();
      await tx.product.deleteMany();
      await tx.costEntry.deleteMany();
      await tx.materialCost.deleteMany();
      await tx.customer.deleteMany();

      for (const c of customers) {
        const {
          products = [],
          orders = [],
          deliveries = [],
          materialCosts = [],
          costEntries = [],
          statements = [],
          payments = [],
          customColumns,
          ...info
        } = c;
        await tx.customer.create({
          data: {
            id: info.id,
            name: info.name,
            contact: info.contact || "",
            phone: info.phone || "",
            address: info.address || "",
            level: info.level || "",
            paymentTerm: info.paymentTerm || "",
            taxNo: info.taxNo || "",
            note: info.note || "",
            customColumns: normalizeCustomColumns(customColumns),
          },
        });

        for (const [table, tableRows] of [
          ["products", products],
          ["orders", orders],
          ["deliveries", deliveries],
          ["materialCosts", materialCosts],
          ["costEntries", costEntries],
          ["statements", statements],
          ["payments", payments],
        ]) {
          if (!tableRows.length) continue;
          const delegate = TABLE_DELEGATES[table];
          await tx[delegate].createMany({
            data: tableRows.map((row, i) => ({
              id: row.id,
              customerId: info.id,
              sortOrder: i,
              data: row,
            })),
          });
        }
      }
    });
    bumpDataVersion();
    res.json({ ok: true, customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post("/", async (req, res) => {
  const {
    id,
    name,
    contact = "",
    phone = "",
    address = "",
    level = "",
    paymentTerm = "",
    taxNo = "",
    note = "",
    customColumns,
  } = req.body;
  try {
    await prisma.customer.create({
      data: {
        id,
        name,
        contact,
        phone,
        address,
        level,
        paymentTerm,
        taxNo,
        note,
        customColumns: normalizeCustomColumns(customColumns),
      },
    });
    bumpDataVersion();
    res.json({
      id,
      name,
      contact,
      phone,
      address,
      level,
      paymentTerm,
      taxNo,
      note,
      customColumns: normalizeCustomColumns(customColumns),
      products: [],
      orders: [],
      deliveries: [],
      materialCosts: [],
      costEntries: [],
      statements: [],
      payments: [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id
router.put("/:id", async (req, res) => {
  const {
    name,
    contact = "",
    phone = "",
    address = "",
    level = "",
    paymentTerm = "",
    taxNo = "",
    note = "",
    customColumns,
  } = req.body;
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        name,
        contact,
        phone,
        address,
        level,
        paymentTerm,
        taxNo,
        note,
        customColumns: normalizeCustomColumns(customColumns),
      },
    });
    bumpDataVersion();
    res.json(normalize(customer));
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id
router.delete("/:id", async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    bumpDataVersion();
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/:id/orders/:orderId/status - update one order status
router.patch("/:id/orders/:orderId/status", async (req, res) => {
  const { id, orderId } = req.params;
  const { status } = req.body || {};
  const nextStatus = String(status || "").trim();
  if (!nextStatus) return res.status(400).json({ error: "Missing status" });
  const allowedExtraFields = [
    "completionTime",
    "completionOperator",
    "completionNote",
    "completionPhoto",
    "completionPhotoAt",
    "completionUserId",
    "completionUserName",
  ];
  const extraData = {};
  for (const field of allowedExtraFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      extraData[field] = req.body[field];
    }
  }

  try {
    const mobileUser = await findUserByMobileToken(req);
    if (hasMobileUserToken(req) && !mobileUser) {
      return res.status(401).json({ error: "手机账号不存在或已失效" });
    }
    const mobileRole = normalizeRole(mobileUser?.role);
    if (mobileUser && mobileRole === "pending") {
      return res.status(403).json({ error: "账号尚未分配角色，请联系管理员" });
    }
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: id,
      },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const ifMatchStatus = String(req.body?.ifMatchStatus || "").trim();
    if (ifMatchStatus && normalizeOrderStatus(order.data?.status) !== ifMatchStatus) {
      return res.status(409).json({ error: "订单状态已变更，请刷新后重试" });
    }

    if (mobileUser && mobileRole === "employee") {
      if (nextStatus !== "已完成") return res.status(403).json({ error: "员工只能完成已排产订单" });
      if (normalizeOrderStatus(order.data?.status) !== "已排产") {
        return res.status(403).json({ error: "员工只能完成已排产订单" });
      }
    }
    if (nextStatus === "已完成" && !req.body?.completionPhoto && !order.data?.completionPhoto) {
      return res.status(400).json({ error: "完成订单必须上传现场照片" });
    }
    if (mobileUser) {
      extraData.completionUserId = mobileUser.id;
      extraData.completionUserName = mobileUser.name || "";
      if (!extraData.completionOperator) extraData.completionOperator = mobileUser.name || "手机端";
    }

    const data = {
      ...(order.data || {}),
      ...extraData,
      status: nextStatus,
    };
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { data },
    });
    bumpDataVersion();
    res.json({ ok: true, row: updated.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/:id/cost-entries - mobile cost entry with photo proof
router.post("/:id/cost-entries", async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const materialName = String(body.materialName || "").trim();
  const photo = body.photo;
  const requestedQuantity = Number(body.quantity || 0);

  if (!materialName) return res.status(400).json({ error: "请填写物料名称" });
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return res.status(400).json({ error: "请输入正确的数量" });
  }
  if (!photo?.dataUrl) return res.status(400).json({ error: "成本录入必须上传照片" });

  try {
    const mobileUser = await findUserByMobileToken(req);
    if (!mobileUser) {
      return res.status(401).json({ error: "手机账号不存在或已失效" });
    }
    const mobileRole = normalizeRole(mobileUser?.role);
    if (mobileRole === "pending") {
      return res.status(403).json({ error: "账号尚未分配角色，请联系管理员" });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { materialCosts: { orderBy: { sortOrder: "asc" } } },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const material = (customer.materialCosts || [])
      .map((row) => row.data || {})
      .find((row) => isSameMaterial(row, body));
    if (!material) return res.status(400).json({ error: "未找到该客户的物料档案" });
    const quantity = requestedQuantity;
    const unitCost = Number(material.unitCost || 0);

    const row = {
      id: makeRowId("costEntries"),
      date: String(body.date || "").trim() || new Date().toISOString().slice(0, 10),
      materialName: material.materialName || materialName,
      quantity,
      unit: String(material.unit || body.unit || "").trim(),
      unitCost,
      amount: quantity * unitCost,
      note: String(body.note || "").trim(),
      photo,
      approvalStatus: "待审核",
      approvedAt: "",
      approvedBy: "",
      approvalNote: "",
      enteredAt: new Date().toISOString(),
      enteredBy: mobileUser.name || "手机端",
      enteredUserId: mobileUser.id || "",
    };

    const maxSort = await prisma.costEntry.aggregate({
      where: { customerId: id },
      _max: { sortOrder: true },
    });
    const created = await prisma.costEntry.create({
      data: {
        id: row.id,
        customerId: id,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        data: row,
      },
    });
    bumpDataVersion();
    res.json({ ok: true, row: created.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/:id/cost-entries/:entryId/approval - admin mobile cost approval
router.patch("/:id/cost-entries/:entryId/approval", async (req, res) => {
  const { id, entryId } = req.params;
  const status = String(req.body?.approvalStatus || "").trim();
  const note = String(req.body?.approvalNote || "").trim();
  if (!["已通过", "已拒绝"].includes(status)) {
    return res.status(400).json({ error: "Invalid approval status" });
  }

  try {
    const mobileUser = await findUserByMobileToken(req);
    if (!mobileUser) return res.status(401).json({ error: "手机账号不存在或已失效" });
    if (normalizeRole(mobileUser.role) !== "admin") {
      return res.status(403).json({ error: "只有管理员可以审批成本" });
    }

    const entry = await prisma.costEntry.findFirst({
      where: { id: entryId, customerId: id },
    });
    if (!entry) return res.status(404).json({ error: "Cost entry not found" });

    const data = {
      ...(entry.data || {}),
      approvalStatus: status,
      approvalNote: note,
      approvedAt: new Date().toISOString(),
      approvedBy: mobileUser.name || "管理员",
      approvedUserId: mobileUser.id,
    };
    const updated = await prisma.costEntry.update({
      where: { id: entryId },
      data: { data },
    });
    bumpDataVersion();
    res.json({ ok: true, row: updated.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/:id/deliveries/:deliveryId/sign - mobile delivery sign-off
router.patch("/:id/deliveries/:deliveryId/sign", async (req, res) => {
  const { id, deliveryId } = req.params;
  const signer = String(req.body?.signer || "").trim();
  const note = String(req.body?.note || "").trim();
  const photo = req.body?.photo;
  const itemIds = Array.isArray(req.body?.itemIds)
    ? req.body.itemIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (!signer) return res.status(400).json({ error: "请填写签收人" });
  if (!photo?.dataUrl) return res.status(400).json({ error: "送货签收必须上传照片" });

  try {
    const mobileUser = await findUserByMobileToken(req);
    if (!mobileUser) return res.status(401).json({ error: "手机账号不存在或已失效" });
    const mobileRole = normalizeRole(mobileUser.role);
    if (mobileRole === "pending") {
      return res.status(403).json({ error: "账号尚未分配角色，请联系管理员" });
    }

    const delivery = await prisma.delivery.findFirst({
      where: { id: deliveryId, customerId: id },
    });
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    const currentData = delivery.data || {};
    if (currentData._finalDelivery === false) {
      return res.status(400).json({ error: "送货单草稿不能签收，请先生成正式送货单" });
    }
    if (normalizeFinalDeliveryStatus(currentData.status) === "作废") {
      return res.status(400).json({ error: "作废送货单不能签收" });
    }
    const allCustomerDeliveries = await prisma.delivery.findMany({ where: { customerId: id } });
    const groupKey = deliveryGroupKey(delivery);
    const groupRows = allCustomerDeliveries
      .filter((row) => deliveryGroupKey(row) === groupKey)
      .sort((a, b) => deliveryGroupSortOrder(a) - deliveryGroupSortOrder(b));
    const groupData = (groupRows.length ? groupRows : [delivery]).map((row) => ({
      ...(row.data || {}),
      id: row.id,
    }));
    const groupItems = groupData.flatMap((row) => normalizeDeliverySignItems(row));
    if (groupItems.length && groupItems.every((item) => item.signed)) {
      return res.status(400).json({ error: "送货单已签收，不能重复签收" });
    }
    const signResult = applyDeliverySignState(groupData, itemIds, {
      signer,
      note,
      photo,
      userId: mobileUser.id,
      userName: mobileUser.name || "",
    });
    if (!signResult.signedItemIds.length) {
      return res.status(400).json({ error: "没有可签收的未签收明细" });
    }

    const rowsToUpdate = groupRows.length ? groupRows : [delivery];
    const updatedRows = await Promise.all(
      rowsToUpdate.map((row, index) =>
        prisma.delivery.update({
          where: { id: row.id },
          data: { data: signResult.deliveries[index] },
        }),
      ),
    );

    const signedItemIdSet = new Set(signResult.signedItemIds.map((item) => String(item)));
    const changedOrderIds = new Set(
      signResult.deliveries
        .filter((row) =>
          normalizeDeliverySignItems(row).some((item) => signedItemIdSet.has(String(item.id))),
        )
        .map((row) => row._linkedOrderId)
        .filter(Boolean),
    );
    if (changedOrderIds.size) {
      const [orders, nextDeliveryRows] = await Promise.all([
        prisma.order.findMany({ where: { customerId: id } }),
        prisma.delivery.findMany({ where: { customerId: id } }),
      ]);
      await Promise.all(
        orders
          .filter((order) => changedOrderIds.has(order.id))
          .map((order) => {
            const sourceFields = new Set(
              nextDeliveryRows
                .map((row) => row.data || {})
                .filter((row) => row._linkedOrderId === order.id)
                .map((row) => deliveryQuantitySource(row)),
            );
            const sourceField = sourceFields.values().next().value || "quantity";
            const deliveredQuantity = nextDeliveryRows
              .map((row) => row.data || {})
              .filter((row) => row._linkedOrderId === order.id)
              .filter(
                (row) =>
                  row._finalDelivery !== false &&
                  normalizeFinalDeliveryStatus(row.status) === "已签收",
              )
              .filter((row) => deliveryQuantitySource(row) === sourceField)
              .reduce((sum, row) => sum + parseNumericValue(row.deliveryQuantity), 0);
            const orderQuantity = parseNumericValue(order.data?.[sourceField]);
            const remainingQuantity = Math.max(orderQuantity - deliveredQuantity, 0);
            const nextStatus = remainingQuantity <= 0.0000001 ? "已送货" : "部分送货";
            const orderData = {
              ...(order.data || {}),
              status: nextStatus,
              deliveredQuantity,
              remainingQuantity,
              statusChangedAt: new Date().toISOString(),
              statusChangeLog: appendAuditLog(
                order.data?.statusChangeLog,
                `送货签收：${nextStatus}`,
              ),
            };
            return prisma.order.update({
              where: { id: order.id },
              data: { data: orderData },
            });
          }),
      );
    }
    bumpDataVersion();
    res.json({
      ok: true,
      row: updatedRows.find((row) => row.id === deliveryId)?.data || updatedRows[0]?.data,
      rows: updatedRows.map((row) => row.data),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id/:tableKey - replace all rows
router.put("/:id/:tableKey", async (req, res) => {
  const { id, tableKey } = req.params;
  if (!VALID_TABLES.has(tableKey)) return res.status(400).json({ error: "Invalid table" });
  const { rows } = req.body;
  try {
    const delegate = TABLE_DELEGATES[tableKey];
    let savedRows = [];
    let newScheduledCount = 0;
    let customerName = "";
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({
        where: { id },
        include: {
          products: { orderBy: { sortOrder: "asc" } },
          orders: { orderBy: { sortOrder: "asc" } },
          deliveries: { orderBy: { sortOrder: "asc" } },
          materialCosts: { orderBy: { sortOrder: "asc" } },
          costEntries: { orderBy: { sortOrder: "asc" } },
          statements: { orderBy: { sortOrder: "asc" } },
          payments: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!current) {
        const err = new Error("Customer not found");
        err.statusCode = 404;
        throw err;
      }
      const currentCustomer = normalize(current);
      customerName = currentCustomer.name || "";
      const existingRows = await tx[delegate].findMany({
        where: { customerId: { not: id } },
        select: { id: true },
      });
      const usedIds = new Set(existingRows.map((row) => row.id));
      savedRows = uniqueRows(rows || [], tableKey, usedIds);
      const savedIds = savedRows.map((row) => row.id);
      const savedIdSet = new Set(savedIds.map(String));
      const removedIds = (currentCustomer[tableKey] || [])
        .map((row) => String(row.id || ""))
        .filter((rowId) => rowId && !savedIdSet.has(rowId));
      assertRowsCanBeDeleted(currentCustomer, tableKey, removedIds);
      if (tableKey === "payments") {
        assertPaymentsWithinStatementAmounts(currentCustomer, savedRows);
      }
      if (tableKey === "deliveries") {
        assertDeliveryRowsCanBeSaved(currentCustomer, savedRows);
      }
      if (tableKey === "orders") {
        newScheduledCount = countNewlyScheduledOrders(currentCustomer.orders || [], savedRows);
      }

      if (savedIds.length) {
        await tx[delegate].deleteMany({
          where: {
            customerId: id,
            id: { notIn: savedIds },
          },
        });
      } else {
        await tx[delegate].deleteMany({ where: { customerId: id } });
      }

      for (let i = 0; i < savedRows.length; i++) {
        await tx[delegate].upsert({
          where: { id: savedRows[i].id },
          update: {
            customerId: id,
            sortOrder: i,
            data: savedRows[i],
          },
          create: {
            id: savedRows[i].id,
            customerId: id,
            sortOrder: i,
            data: savedRows[i],
          },
        });
      }
    });
    bumpDataVersion();
    if (newScheduledCount) {
      void notifyProductionSchedulePublished({
        count: newScheduledCount,
        customerName,
      });
    }
    res.json({ ok: true, rows: savedRows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id/:tableKey/rows - delete specific rows
router.delete("/:id/:tableKey/rows", async (req, res) => {
  const { id, tableKey } = req.params;
  if (!VALID_TABLES.has(tableKey)) return res.status(400).json({ error: "Invalid table" });
  const { ids } = req.body;
  try {
    const delegate = TABLE_DELEGATES[tableKey];
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({
        where: { id },
        include: {
          products: { orderBy: { sortOrder: "asc" } },
          orders: { orderBy: { sortOrder: "asc" } },
          deliveries: { orderBy: { sortOrder: "asc" } },
          materialCosts: { orderBy: { sortOrder: "asc" } },
          costEntries: { orderBy: { sortOrder: "asc" } },
          statements: { orderBy: { sortOrder: "asc" } },
          payments: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!current) {
        const err = new Error("Customer not found");
        err.statusCode = 404;
        throw err;
      }
      assertRowsCanBeDeleted(normalize(current), tableKey, ids || []);
      await tx[delegate].deleteMany({
        where: {
          customerId: id,
          id: { in: ids },
        },
      });
    });
    bumpDataVersion();
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
