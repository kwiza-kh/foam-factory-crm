import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("start-local-mysql.ps1", () => {
  it("searches common Windows MySQL install directories when mysql.exe is not on PATH", () => {
    const script = readFileSync(new URL("./start-local-mysql.ps1", import.meta.url), "utf8");

    expect(script).toContain("C:\\Program Files\\MySQL");
    expect(script).toContain("Get-ChildItem");
    expect(script).toContain("mysql.exe");
  });

  it("uses a temporary defaults file instead of putting passwords on the command line", () => {
    const script = readFileSync(new URL("./start-local-mysql.ps1", import.meta.url), "utf8");

    expect(script).toContain("--defaults-extra-file=");
    expect(script).not.toContain("--password=$Password");
  });

  it("captures mysql stderr so access-denied errors can fall through to the friendly setup message", () => {
    const script = readFileSync(new URL("./start-local-mysql.ps1", import.meta.url), "utf8");

    expect(script).toContain("$previousErrorActionPreference");
    expect(script).toContain("$ErrorActionPreference = 'Continue'");
    expect(script).toContain("2>&1");
  });
});
