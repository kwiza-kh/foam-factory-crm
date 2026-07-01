import { describe, expect, it } from "vitest";

import {
  buildLanApiBaseUrl,
  resolveStoredApiBaseUrl,
} from "./apiBaseUrl.js";

describe("mobile API base URL", () => {
  it("builds the backend API URL from Expo LAN host and fixed backend port", () => {
    expect(
      buildLanApiBaseUrl({
        expoConfig: { hostUri: "192.168.31.25:8081" },
      }),
    ).toBe("http://192.168.31.25:3001/api");
  });

  it("uses debuggerHost when hostUri is not available", () => {
    expect(
      buildLanApiBaseUrl({
        manifest: { debuggerHost: "10.0.0.8:19000" },
      }),
    ).toBe("http://10.0.0.8:3001/api");
  });

  it("ignores non-LAN hosts and falls back to loopback", () => {
    expect(
      buildLanApiBaseUrl({
        expoConfig: { hostUri: "localhost:8081" },
        manifest: { debuggerHost: "8.8.8.8:19000" },
      }),
    ).toBe("http://127.0.0.1:3001/api");
  });

  it("replaces a saved loopback URL when a LAN URL is available", () => {
    expect(
      resolveStoredApiBaseUrl(
        "http://127.0.0.1:3001/api",
        "http://192.168.31.25:3001/api",
      ),
    ).toBe("http://192.168.31.25:3001/api");
  });

  it("replaces a saved localhost URL when a LAN URL is available", () => {
    expect(
      resolveStoredApiBaseUrl(
        "http://localhost:3001/api",
        "http://192.168.31.25:3001/api",
      ),
    ).toBe("http://192.168.31.25:3001/api");
  });

  it("keeps a manually saved non-loopback URL", () => {
    expect(
      resolveStoredApiBaseUrl(
        "http://192.168.1.99:3001/api/",
        "http://192.168.31.25:3001/api",
      ),
    ).toBe("http://192.168.1.99:3001/api");
  });
});
