import assert from "node:assert/strict";
import { test } from "node:test";
import { preparerCatalogue, verifierContrats } from "./catalogue-signe.mjs";
import { definirArret } from "./arret-contrat.mjs";

test("un arrêt est ajouté, remplacé puis annulé sans toucher aux autres majeures", () => {
  let c = definirArret([], { majeure: 1, avertir: 100, refuser: 200, message: "Fini." });
  assert.deepEqual(c, [{ majeure: 1, avertir_des: 100, refuser_des: 200, message: "Fini." }]);
  c = definirArret(c, { majeure: 2, refuser: 900 });
  c = definirArret(c, { majeure: 1, avertir: 150, refuser: 250 });
  assert.deepEqual(c, [
    { majeure: 1, avertir_des: 150, refuser_des: 250 },
    { majeure: 2, refuser_des: 900 },
  ]);
  assert.deepEqual(definirArret(c, { majeure: 1, annuler: true }), [{ majeure: 2, refuser_des: 900 }]);
});

test("refus : sans date, avertissement après le refus, champs invalides, doublons", () => {
  assert.throws(() => definirArret([], { majeure: 1 }), /--avertir/);
  assert.throws(() => definirArret([], { majeure: 1, avertir: 300, refuser: 200 }), /précéder/);
  assert.throws(() => verifierContrats("non"), /liste/);
  assert.throws(() => verifierContrats([{ majeure: 0 }]), /majeure/);
  assert.throws(() => verifierContrats([{ majeure: 1, refuser_des: "demain" }]), /refuser_des/);
  assert.throws(() => verifierContrats([{ majeure: 1 }, { majeure: 1 }]), /double/);
  assert.throws(() => verifierContrats([{ majeure: 1, message: 3 }]), /message/);
  assert.deepEqual(verifierContrats(undefined), []);
});

test("le renouvellement mensuel garde les arrêts programmés", () => {
  const contrats = [{ majeure: 1, avertir_des: 100, refuser_des: 200 }];
  const p = preparerCatalogue({ format: 2, sequence: 4, plugins: [], revocations: [], contrats }, 1_790_000_000);
  assert.deepEqual(p.contrats, contrats);
  assert.deepEqual(preparerCatalogue({ format: 2, sequence: 4 }, 1_790_000_000).contrats, []);
  assert.throws(() => preparerCatalogue({ contrats: [{ majeure: -1 }] }, 1_790_000_000));
});
