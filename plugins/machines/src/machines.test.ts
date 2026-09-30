import type { Saw } from "@etabli/sdk";
import { describe, expect, it } from "vitest";
import { cleanMachines, newMachine, requestedKind, setNumber } from "./machines";

describe("newMachine", () => {
  it("propose des réglages courants pour une scie et pour une cisaille", () => {
    expect(newMachine("scie")).toMatchObject({ kind: "scie", type: "ruban", kerf: 2, stopMax: null });
    expect(newMachine("cisaille")).toMatchObject({ kind: "cisaille", bladeLength: 2050, maxThickness: 4 });
  });
});

describe("cleanMachines", () => {
  it("ne garde que les scies et les cisailles", () => {
    expect(cleanMachines(null)).toEqual([]);
    expect(cleanMachines([{ kind: "presse" }, 3, null])).toEqual([]);
  });

  it("complète et corrige une scie d'une ancienne version", () => {
    const [saw] = cleanMachines([{ id: "s1", kind: "scie", name: "Ruban", kerf: "x", type: "inconnu", stopMax: 500 }]);
    expect(saw).toMatchObject({ id: "s1", name: "Ruban", type: "ruban", kerf: 2, stopMax: 500, minLength: 30 });
  });

  it("garde « pas de butée » (null) et lit une cisaille", () => {
    const [saw, shear] = cleanMachines([
      { kind: "scie", stopMax: null },
      { kind: "cisaille", name: "Cisaille 2050", bladeLength: 3000 },
    ]);
    expect(saw).toMatchObject({ stopMax: null });
    expect(shear).toMatchObject({ kind: "cisaille", name: "Cisaille 2050", bladeLength: 3000, gaugeMax: 750 });
  });
});

describe("setNumber", () => {
  it("accepte la virgule, refuse le négatif, et met 0 pour un champ vidé", () => {
    const saw = newMachine("scie") as Saw;
    setNumber(saw, "kerf", "1,6");
    expect(saw).toMatchObject({ kerf: 1.6 });
    setNumber(saw, "kerf", "-2");
    expect(saw).toMatchObject({ kerf: 0 });
    setNumber(saw, "trim", "");
    expect(saw).toMatchObject({ trim: 0 });
  });
});

describe("requestedKind", () => {
  it("lit l'intention envoyée par le moteur", () => {
    expect(requestedKind("#add=scie")).toBe("scie");
    expect(requestedKind("add=cisaille")).toBe("cisaille");
    expect(requestedKind("#add=presse")).toBeNull();
    expect(requestedKind("")).toBeNull();
  });
});
