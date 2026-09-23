import { describe, expect, it } from "vitest";
import { DEFAULT_MACHINES, cleanMachines } from "./machines";

describe("cleanMachines", () => {
  it("donne l'atelier type quand rien n'est enregistré", () => {
    expect(cleanMachines(null)).toEqual(DEFAULT_MACHINES);
    expect(cleanMachines("abîmé")).toEqual(DEFAULT_MACHINES);
  });

  it("complète les champs manquants et convertit les nombres", () => {
    const machines = cleanMachines({ saws: [{ id: "a", name: "Ruban atelier", kerf: 1.5, type: "inconnu" }] });
    expect(machines.saws).toHaveLength(1);
    expect(machines.saws[0]).toMatchObject({ id: "a", name: "Ruban atelier", kerf: "1.5", type: "ruban", trim: "5" });
    // Liste des cisailles absente : celle de l'atelier type.
    expect(machines.shears).toEqual(DEFAULT_MACHINES.shears);
  });

  it("garde une liste vidée par l'utilisateur et écarte les lignes illisibles", () => {
    const machines = cleanMachines({ saws: [], shears: [null, 3, { id: "c", bladeLength: "3100" }] });
    expect(machines.saws).toEqual([]);
    expect(machines.shears).toHaveLength(1);
    expect(machines.shears[0]).toMatchObject({ id: "c", bladeLength: "3100", gaugeMax: "750" });
  });
});
