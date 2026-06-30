import { describe, expect, it } from "vitest";

import { createMySqlAdapterConfig } from "./dbConfig.js";

describe("createMySqlAdapterConfig", () => {
  it("accepts mysql URLs and exposes the selected database to Prisma", () => {
    const config = createMySqlAdapterConfig("mysql://foam_user:secret@localhost:3306/foam_crm");

    expect(config).toEqual({
      connectionString: "mysql://foam_user:secret@localhost:3306/foam_crm",
      database: "foam_crm",
    });
  });

  it("accepts mariadb URLs for MySQL-compatible hosted databases", () => {
    const config = createMySqlAdapterConfig(
      "mariadb://foam_user:secret@db.example.com:3306/foam_crm",
    );

    expect(config.database).toBe("foam_crm");
  });

  it("rejects the previous PostgreSQL URL scheme", () => {
    expect(() =>
      createMySqlAdapterConfig("postgresql://postgres:secret@localhost:5432/foam_crm"),
    ).toThrow("DATABASE_URL must start with mysql:// or mariadb://");
  });

  it("requires a password in DATABASE_URL", () => {
    expect(() => createMySqlAdapterConfig("mysql://foam_user@localhost:3306/foam_crm")).toThrow(
      "DATABASE_URL must include a MySQL password",
    );
  });

  it("requires a database name in DATABASE_URL", () => {
    expect(() => createMySqlAdapterConfig("mysql://foam_user:secret@localhost:3306/")).toThrow(
      "DATABASE_URL must include a MySQL database name",
    );
  });
});
