import { describe, expect, it } from "vitest";
import { stripAmounts } from "../alerts";

describe("alerts that go through a public push service", () => {
  it("never carry a dollar amount", () => {
    expect(stripAmounts("Won: Janitorial services, county annex for $3,800")).toBe("Won: Janitorial services, county annex");
    expect(stripAmounts("Submitted the bid at $4,000.50 today")).toBe("Submitted the bid today");
    expect(stripAmounts("Needs you: set a price between $3,792 and $4,000")).toBe("Needs you: set a price between and");
    expect(stripAmounts("No amounts here")).toBe("No amounts here");
  });
});
