import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerPlugin } from "./nouveau-plugin.mjs";
import { validerPlugin } from "./valider-plugin.mjs";

const options = { id: "soudage", nom: "Soudage", couleur: "#d9480f", icone: "flame", reglages: false, date: "2026-10-01" };

function dansUnDossierTemporaire(fonction) {
  const dossier = mkdtempSync(join(tmpdir(), "etabli-plugin-"));
  try {
    return fonction(dossier);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

test("crée un plugin que le validateur accepte (sans dist)", () => {
  dansUnDossierTemporaire((racine) => {
    const { dossier, fichiers } = creerPlugin(options, racine);
    assert.ok(fichiers.includes("public/manifest.json"));
    assert.ok(fichiers.includes("CHANGELOG.md"));
    assert.ok(existsSync(join(dossier, "src", "exemple.test.ts")));
    const manifeste = JSON.parse(readFileSync(join(dossier, "public", "manifest.json"), "utf8"));
    assert.equal(manifeste.id, "soudage");
    assert.equal(manifeste.version, "0.1.0");
    assert.deepEqual(manifeste.permissions, []);
    assert.deepEqual(validerPlugin(dossier, { dist: false }), { erreurs: [], avertissements: [] });
  });
});

test("avec --reglages : une page de réglages déclarée et écrite", () => {
  dansUnDossierTemporaire((racine) => {
    const { dossier } = creerPlugin({ ...options, reglages: true }, racine);
    const manifeste = JSON.parse(readFileSync(join(dossier, "public", "manifest.json"), "utf8"));
    assert.equal(manifeste.settings[0].entry, "reglages/index.html");
    assert.ok(existsSync(join(dossier, "reglages", "Reglages.svelte")));
    assert.match(readFileSync(join(dossier, "vite.config.ts"), "utf8"), /reglages: page\("reglages"\)/);
    assert.deepEqual(validerPlugin(dossier, { dist: false }).erreurs, []);
  });
});

test("refuse un identifiant invalide, réservé ou déjà pris", () => {
  dansUnDossierTemporaire((racine) => {
    assert.throws(() => creerPlugin({ ...options, id: "Soudage" }, racine), /identifiant/);
    assert.throws(() => creerPlugin({ ...options, id: "sdk" }, racine), /réservé/);
    assert.throws(() => creerPlugin({ ...options, couleur: "rouge" }, racine), /couleur/);
    creerPlugin(options, racine);
    assert.throws(() => creerPlugin(options, racine), /existe déjà/);
  });
});
