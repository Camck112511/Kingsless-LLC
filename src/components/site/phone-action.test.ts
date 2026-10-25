import { afterEach, describe, expect, it, vi } from "vitest";
import { revealPhone } from "./phone-action";

afterEach(() => vi.unstubAllEnvs());
const withPhone = async (value: string | undefined) => {
  vi.stubEnv("CONTACT_PHONE", value ?? "");
  return revealPhone();
};

describe("Phone button: the number it will publish", () => {
  it("formats a normal US number as a tap-to-call link", async () => {
    expect(await withPhone("(512) 217-7788")).toEqual({ display: "(512) 217-7788", tel: "5122177788" });
    expect(await withPhone("512.217.7788")).toEqual({ display: "512.217.7788", tel: "5122177788" });
    expect(await withPhone("+1 512 217 7788")).toEqual({ display: "+1 512 217 7788", tel: "+15122177788" });
  });

  it("refuses a number with a letter in it instead of quietly publishing a shorter, wrong one", async () => {
    expect(await withPhone("5122177u88")).toBeNull();
    expect(await withPhone("512-217-77O8")).toBeNull();
  });

  it("refuses an empty or implausible value", async () => {
    for (const v of [undefined, "", "   ", "123", "1".repeat(20), "call us"]) expect(await withPhone(v)).toBeNull();
  });
});
