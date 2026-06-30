export function createMySqlAdapterConfig(connectionString) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env and set your MySQL password.",
    );
  }

  const url = new URL(connectionString);
  if (!["mysql:", "mariadb:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must start with mysql:// or mariadb://");
  }
  if (!url.password) {
    throw new Error(
      "DATABASE_URL must include a MySQL password, for example mysql://root:password@localhost:3306/foam_crm",
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) {
    throw new Error("DATABASE_URL must include a MySQL database name");
  }

  return {
    connectionString,
    database,
  };
}
