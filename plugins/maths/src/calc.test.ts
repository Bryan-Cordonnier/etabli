import { describe, expect, it } from "vitest";
import { evaluate, format, isExpression } from "./calc";

describe("evaluate", () => {
  it("lit les nombres à la française", () => {
    expect(evaluate("12,5")).toBe(12.5);
    expect(evaluate(" 350 ")).toBe(350);
    expect(evaluate(".5")).toBe(0.5);
  });

  it("respecte les priorités", () => {
    expect(evaluate("1200 - 2*15")).toBe(1170);
    expect(evaluate("(1200 - 2) * 15")).toBe(17970);
    expect(evaluate("2 + 3 * 4 ^ 2")).toBe(50);
    expect(evaluate("-2^2")).toBe(-4);
    expect(evaluate("2^3^2")).toBe(512);
    expect(evaluate("10 / 4")).toBe(2.5);
    expect(evaluate("6 × 7")).toBe(42);
  });

  it("calcule les fonctions en degrés", () => {
    expect(evaluate("sqrt(3^2 + 4^2)")).toBe(5);
    expect(evaluate("cos(60)")).toBeCloseTo(0.5, 12);
    expect(evaluate("sin(30) * 500")).toBeCloseTo(250, 9);
    expect(evaluate("atan(1)")).toBeCloseTo(45, 12);
    expect(evaluate("2 * pi")).toBeCloseTo(6.283185307, 8);
  });

  it("refuse ce qui n'est pas un calcul", () => {
    expect(evaluate("")).toBeNaN();
    expect(evaluate("abc")).toBeNaN();
    expect(evaluate("2 +")).toBeNaN();
    expect(evaluate("(2")).toBeNaN();
    expect(evaluate("sqrt 4")).toBeNaN();
    expect(evaluate("1 / 0")).toBeNaN();
    expect(evaluate("alert(1)")).toBeNaN();
  });
});

describe("isExpression", () => {
  it("distingue un nombre d'un calcul", () => {
    expect(isExpression("350")).toBe(false);
    expect(isExpression("-12,5")).toBe(false);
    expect(isExpression("1200 - 30")).toBe(true);
    expect(isExpression("sqrt(2)")).toBe(true);
  });
});

describe("format", () => {
  it("formate à la française", () => {
    expect(format(372.9477)).toBe("372,95");
    expect(format(1234.5)).toBe("1 234,5");
    expect(format(NaN)).toBe("—");
  });
});
