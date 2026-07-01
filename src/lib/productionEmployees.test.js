import { describe, expect, it } from "vitest";

import { buildProductionEmployeeOptions } from "./productionEmployees.js";

describe("buildProductionEmployeeOptions", () => {
  it("uses only registered employee users as production employee options", () => {
    expect(
      buildProductionEmployeeOptions([
        { id: "u1", name: "张三", phone: "13800138001", role: "employee" },
        { id: "u2", name: "李四", phone: "13800138002", role: "admin" },
        { id: "u3", name: "王五", phone: "13800138003", role: "pending" },
        { id: "u4", name: "赵六", phone: "13800138004", role: "employee" },
      ]),
    ).toEqual([
      { value: "张三", label: "张三", userId: "u1", phone: "13800138001" },
      { value: "赵六", label: "赵六", userId: "u4", phone: "13800138004" },
    ]);
  });

  it("falls back to phone for employee display when name is missing", () => {
    expect(
      buildProductionEmployeeOptions([
        { id: "u1", name: "  ", phone: "13800138001", role: "employee" },
      ]),
    ).toEqual([
      {
        value: "13800138001",
        label: "13800138001",
        userId: "u1",
        phone: "13800138001",
      },
    ]);
  });

  it("deduplicates employees by selected display value", () => {
    expect(
      buildProductionEmployeeOptions([
        { id: "u1", name: "张三", phone: "13800138001", role: "employee" },
        { id: "u2", name: "张三", phone: "13800138002", role: "employee" },
      ]),
    ).toEqual([{ value: "张三", label: "张三", userId: "u1", phone: "13800138001" }]);
  });
});
