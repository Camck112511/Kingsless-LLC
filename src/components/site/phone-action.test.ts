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

  it("with no CONTACT_PHONE set, serves the number built into the site", async () => {
    for (const v of [undefined, "", "   "]) expect(await withPhone(v)).toEqual({ display: "(512) 217-7788", tel: "5122177788" });
  });

  it("a CONTACT_PHONE override wins over the built-in number", async () => {
    expect(await withPhone("(737) 555-0142")).toEqual({ display: "(737) 555-0142", tel: "7375550142" });
  });

  it("refuses an implausible CONTACT_PHONE instead of falling back to a number the owner did not intend", async () => {
    for (const v of ["123", "1".repeat(20), "call us"]) expect(await withPhone(v)).toBeNull();
  });
});
