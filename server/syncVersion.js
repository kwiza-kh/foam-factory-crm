import { prisma } from "./db.js";

const DATA_VERSION_KEY = "data_version";

let dataVersion = Date.now();

// Restore persisted version on startup (newer than process start time wins)
prisma.appSetting
  .findUnique({ where: { key: DATA_VERSION_KEY } })
  .then((setting) => {
    if (setting?.data?.version) {
      dataVersion = Math.max(dataVersion, setting.data.version);
    }
  })
  .catch(() => {});

export function getDataVersion() {
  return dataVersion;
}

export function bumpDataVersion() {
  dataVersion = Date.now();
  // Fire-and-forget persist — callers don't need to await
  prisma.appSetting
    .upsert({
      where: { key: DATA_VERSION_KEY },
      create: { key: DATA_VERSION_KEY, data: { version: dataVersion } },
      update: { data: { version: dataVersion } },
    })
    .catch(() => {});
  return dataVersion;
}
