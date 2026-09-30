// Les fichiers YAML de .github sont valides : un deux-points mal placé (« public : utilisez ») suffit à
// faire ignorer en silence par GitHub un fichier entier (liens de contact, formulaire de ticket).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const GITHUB = join(RACINE, ".github");

function* yaml(dossier) {
  for (const nom of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, nom.name);
    if (nom.isDirectory()) yield* yaml(chemin);
    else if (/\.ya?ml$/.test(nom.name)) yield chemin;
  }
}

const nom = (chemin) => relative(RACINE, chemin).split("\\").join("/");
const fichiers = [...yaml(GITHUB)];

test("tous les fichiers YAML de .github sont lisibles", () => {
  assert.ok(fichiers.length >= 8, "workflows, modèles de tickets, Dependabot");
  for (const fichier of fichiers) {
    assert.doesNotThrow(() => parse(readFileSync(fichier, "utf8")), `${nom(fichier)} n'est pas du YAML valide`);
  }
});

test("config.yml : tickets vides désactivés et liens de contact complets", () => {
  const config = parse(readFileSync(join(GITHUB, "ISSUE_TEMPLATE", "config.yml"), "utf8"));
  assert.equal(config.blank_issues_enabled, false);
  assert.ok(config.contact_links.length >= 2);
  for (const lien of config.contact_links) {
    assert.ok(lien.name && lien.about, `lien incomplet : ${JSON.stringify(lien)}`);
    assert.match(lien.url, /^https:\/\/github\.com\/Bryan-Cordonnier\/etabli\//);
  }
});

test("formulaires de ticket : nom, description et champs", () => {
  const dossier = join(GITHUB, "ISSUE_TEMPLATE");
  const formulaires = readdirSync(dossier).filter((f) => f.endsWith(".yml") && f !== "config.yml");
  assert.ok(formulaires.length >= 4);
  for (const fichier of formulaires) {
    const formulaire = parse(readFileSync(join(dossier, fichier), "utf8"));
    assert.ok(formulaire.name && formulaire.description, `${fichier} : name et description obligatoires`);
    assert.ok(Array.isArray(formulaire.body) && formulaire.body.length > 0, `${fichier} : body vide`);
    const ids = formulaire.body.map((champ) => champ.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${fichier} : identifiants de champ en double`);
    for (const champ of formulaire.body) {
      if (champ.type !== "markdown") assert.ok(champ.attributes?.label, `${fichier} : un champ « ${champ.type} » n'a pas de label`);
    }
  }
});

test("étiquettes des formulaires : elles existent dans labels.json", () => {
  const connues = new Set(JSON.parse(readFileSync(join(GITHUB, "labels.json"), "utf8")).map((l) => l.name));
  const dossier = join(GITHUB, "ISSUE_TEMPLATE");
  for (const fichier of readdirSync(dossier).filter((f) => f.endsWith(".yml") && f !== "config.yml")) {
    const formulaire = parse(readFileSync(join(dossier, fichier), "utf8"));
    for (const etiquette of formulaire.labels ?? []) assert.ok(connues.has(etiquette), `${fichier} : étiquette « ${etiquette} » absente de labels.json`);
  }
});
