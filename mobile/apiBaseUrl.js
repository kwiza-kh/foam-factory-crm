const backendPort = 3001;
const apiPath = "/api";
const loopbackApiBaseUrl = `http://127.0.0.1:${backendPort}${apiPath}`;

function firstLanIp(value = "") {
  const matches = String(value).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  return matches.find((ip) => {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  });
}

export function buildLanApiBaseUrl(constants = {}) {
  const hostCandidates = [
    constants.expoConfig?.hostUri,
    constants.manifest2?.extra?.expoClient?.hostUri,
    constants.manifest?.debuggerHost,
    constants.manifest?.hostUri,
  ];
  for (const candidate of hostCandidates) {
    const ip = firstLanIp(candidate);
    if (ip) return `http://${ip}:${backendPort}${apiPath}`;
  }
  return loopbackApiBaseUrl;
}

export function resolveStoredApiBaseUrl(savedApiUrl = "", autoApiUrl = loopbackApiBaseUrl) {
  const saved = String(savedApiUrl || "").trim().replace(/\/$/, "");
  if (!saved) return autoApiUrl;
  const savedIsLoopback =
    saved === loopbackApiBaseUrl || saved === `http://localhost:${backendPort}${apiPath}`;
  if (savedIsLoopback && autoApiUrl !== loopbackApiBaseUrl) return autoApiUrl;
  return saved;
}
