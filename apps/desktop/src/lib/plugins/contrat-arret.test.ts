import { describe, expect, it } from "vitest";
import { readArrets, statutContrat } from "./contrat-arret";

const arrets = readArrets({ contrats: [{ majeure: 1, avertir_des: 100, refuser_des: 200 }] });

describe("arrêt du contrat ^1", () => {
  it("accepte, avertit, puis refuse selon la date", () => {
    expect(statutContrat(arrets, "^1", 99).statut).toBe("accepte");
    expect(statutContrat(arrets, "^1", 100)).toMatchObject({ statut: "avertir", phrase: expect.stringContaining("^1") });
    expect(statutContrat(arrets, "^1", 199).statut).toBe("avertir");
    expect(statutContrat(arrets, "^1", 200)).toMatchObject({ statut: "refuse", phrase: expect.stringContaining("plus acceptés") });
  });

  it("ne touche pas le contrat 2 ; un apiVersion absent ou illisible est le contrat 1", () => {
    expect(statutContrat(arrets, "^2", 9999).statut).toBe("accepte");
    expect(statutContrat(arrets, undefined, 200).statut).toBe("refuse");
    expect(statutContrat(arrets, "latest", 200).statut).toBe("refuse");
  });

  it("sans arrêt annoncé, rien n'est jamais refusé", () => {
    for (const raw of [undefined, null, {}, { contrats: "non" }, { contrats: [{ majeure: "un" }, null, { majeure: 0 }] }]) {
      expect(statutContrat(readArrets(raw), "^1", Number.MAX_SAFE_INTEGER).statut, JSON.stringify(raw)).toBe("accepte");
    }
    expect(statutContrat(readArrets({ contrats: [{ majeure: 1 }] }), "^1", 5).statut).toBe("accepte");
  });

  it("le message du catalogue remplace la phrase par défaut", () => {
    const a = readArrets({ contrats: [{ majeure: 1, refuser_des: 1, message: " Fini le 1er mars. " }] });
    expect(statutContrat(a, "^1", 1)).toEqual({ statut: "refuse", phrase: "Fini le 1er mars." });
  });
});
