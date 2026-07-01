export function buildProductionEmployeeOptions(users = []) {
  const seen = new Set();
  return users
    .filter((user) => user?.role === "employee")
    .map((user) => {
      const name = String(user.name || "").trim();
      const phone = String(user.phone || "").trim();
      const value = name || phone;
      if (!value || seen.has(value)) return null;
      seen.add(value);
      return {
        value,
        label: value,
        userId: user.id,
        phone,
      };
    })
    .filter(Boolean);
}
