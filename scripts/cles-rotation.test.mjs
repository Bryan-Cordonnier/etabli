import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ajouterCle, cleValide, dateEnSecondes, finirCle, listeVide, preparerListe, retirerCle } from "./cles-rotation.mjs";
import { ecrireEtSigner } from "./catalogue-signe.mjs";

const fixtures = new URL("../crates/noyau/fixtures/", import.meta.url);
const PUB1 = readFileSync(new URL("cle-publication-1-essai.pub", fixtures), "utf8");
const PUB2 = readFileSync(new URL("cle-publication-2-essai.pub", fixtures), "utf8");
const T0 = dateEnSecondes("2026-01-01");

test("dates et clés publiques contrôlées", () => {
  assert.equal(dateEnSecondes("1970-01-02"), 86400);
  for (const m of ["2026-1-1", "demain", "", undefined, "2026-13-45"]) assert.throws(() => dateEnSecondes(m), undefined, String(m));
  assert.ok(cleValide(PUB1));
  for (const m of ["", "abc", "bm9uIG1pbmlzaWdu", null, 3]) assert.ok(!cleValide(m), String(m));
});

test("rotation : ajouter la nouvelle clé, finir l'ancienne, séquence qui augmente", () => {
  let l = ajouterCle(listeVide(), { id: "2026-a", cle: PUB1, depuis: T0 });
  l = preparerListe(l, T0 + 10);
  assert.equal(l.sequence, 1);
  l = ajouterCle(l, { id: "2027-a", cle: PUB2, depuis: T0 + 100 });
  l = finirCle(l, "2026-a", T0 + 1000);
  const s = preparerListe(l, T0 + 200);
  assert.equal(s.sequence, 2);
  assert.equal(s.cles.length, 2);
  assert.equal(s.cles[0].jusqua, T0 + 1000);
});

test("compromission : retirer une clé", () => {
  let l = ajouterCle(listeVide(), { id: "a", cle: PUB1, depuis: T0 });
  l = ajouterCle(l, { id: "b", cle: PUB2, depuis: T0 });
  l = retirerCle(l, "a");
  assert.deepEqual(l.cles.map((c) => c.id), ["b"]);
  assert.throws(() => retirerCle(l, "a"), /absente/);
});

test("refus : doublons, identifiant ou clé invalide, dates incohérentes, liste sans clé valide", () => {
  const l = ajouterCle(listeVide(), { id: "a", cle: PUB1, depuis: T0 });
  assert.throws(() => ajouterCle(l, { id: "a", cle: PUB2, depuis: T0 }), /existe déjà/);
  assert.throws(() => ajouterCle(l, { id: "b", cle: PUB1, depuis: T0 }), /déjà/);
  assert.throws(() => ajouterCle(l, { id: "B!", cle: PUB2, depuis: T0 }), /Identifiant/);
  assert.throws(() => ajouterCle(l, { id: "b", cle: "nimporte", depuis: T0 }), /illisible/);
  assert.throws(() => ajouterCle(l, { id: "b", cle: PUB2, depuis: T0, jusqua: T0 }), /doit suivre/);
  assert.throws(() => finirCle(l, "a", T0), /doit suivre/);
  assert.throws(() => preparerListe(l, T0 - 1), /Aucune clé/);
  assert.throws(() => preparerListe(finirCle(l, "a", T0 + 5), T0 + 5), /Aucune clé/);
  assert.throws(() => preparerListe(listeVide(), T0), /Aucune clé/);
});

test("le fichier signé est celui de la liste préparée (signature simulée)", () => {
  const dossier = mkdtempSync(join(tmpdir(), "etabli-cles-"));
  const fichier = join(dossier, "cles.json");
  const l = preparerListe(ajouterCle(listeVide(), { id: "a", cle: PUB1, depuis: T0 }), T0);
  let vu = null;
  ecrireEtSigner(fichier, l, (f) => {
    vu = readFileSync(f, "utf8");
    writeFileSync(`${f}.minisig`, "sig");
  });
  assert.deepEqual(JSON.parse(vu), l);
});
