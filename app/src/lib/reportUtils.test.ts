import { getProductTypeFromSquad } from "@/lib/reportUtils";

const squadsMap = {
  Platform: ["Squad 1 - Alpha", "Squad 2 - Beta", "Squad 3 - Gamma"],
  Core: ["Squad 1 - Delta", "Squad 2 - Epsilon", "Squad 3 - Zeta"],
  Commerce: ["Identity & Auth", "Payments", "Search & Commerce - Nova"],
};

describe("getProductTypeFromSquad", () => {
  it("returns the correct product type for a Platform squad", () => {
    expect(getProductTypeFromSquad("Squad 1 - Alpha", squadsMap)).toBe(
      "Platform",
    );
    expect(getProductTypeFromSquad("Squad 2 - Beta", squadsMap)).toBe(
      "Platform",
    );
  });

  it("returns the correct product type for a Core squad", () => {
    expect(getProductTypeFromSquad("Squad 1 - Delta", squadsMap)).toBe("Core");
    expect(getProductTypeFromSquad("Squad 3 - Zeta", squadsMap)).toBe("Core");
  });

  it("returns the correct product type for a Commerce squad", () => {
    expect(getProductTypeFromSquad("Identity & Auth", squadsMap)).toBe(
      "Commerce",
    );
    expect(getProductTypeFromSquad("Payments", squadsMap)).toBe("Commerce");
  });

  it('returns "Platform" as fallback when the squad is not in the map', () => {
    expect(getProductTypeFromSquad("Unknown Squad", squadsMap)).toBe(
      "Platform",
    );
  });

  it('returns "Platform" as fallback when the map is empty', () => {
    expect(getProductTypeFromSquad("Any Squad", {})).toBe("Platform");
  });
});
