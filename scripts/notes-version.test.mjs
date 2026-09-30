import assert from "node:assert/strict";
import { test } from "node:test";
import { dateDeVersion, enTexte, extraireSection, notesDeRelease, versions } from "./notes-version.mjs";

const JOURNAL = `# Journal des changements

Format inspiré de Keep a Changelog.

## [Non publié]

### Ajouté

- Une idée en cours.

## [0.3.0] — 2026-09-30

### Ajouté

- **Fournisseurs** et **Machines** deviennent des plugins, voir [le guide](docs/09.md).
- Dépendances entre plugins.

### Corrigé

- Un bug.

## [0.2.0] — 2026-09-29

### Ajouté

- Le catalogue.

## [0.1.0] - 2026-09-28

Première version.

[Non publié]: https://github.com/x/y/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/x/y/compare/v0.2.0...v0.3.0
`;

test("versions : du plus récent au plus ancien, sans « Non publié »", () => {
  assert.deepEqual(versions(JOURNAL), ["0.3.0", "0.2.0", "0.1.0"]);
});

test("extraireSection : le corps d'une version, sans le titre ni les liens du bas", () => {
  const section = extraireSection(JOURNAL, "0.3.0");
  assert.match(section, /^### Ajouté/);
  assert.match(section, /Dépendances entre plugins/);
  assert.match(section, /### Corrigé/);
  assert.doesNotMatch(section, /0\.2\.0/);
  assert.doesNotMatch(section, /compare/);
});

test("extraireSection : dernière section, tiret simple dans le titre, section « Non publié »", () => {
  assert.equal(extraireSection(JOURNAL, "0.1.0"), "Première version.");
  assert.match(extraireSection(JOURNAL, "Non publié"), /Une idée en cours/);
});

test("extraireSection : version absente ou section vide", () => {
  assert.equal(extraireSection(JOURNAL, "9.9.9"), null);
  assert.equal(extraireSection("## [1.0.0] — 2026-01-01\n\n## [0.9.0] — 2025-12-01\n\n- x\n", "1.0.0"), null);
});

test("dateDeVersion", () => {
  assert.equal(dateDeVersion(JOURNAL, "0.3.0"), "2026-09-30");
  assert.equal(dateDeVersion(JOURNAL, "Non publié"), null);
});

test("enTexte : titres en majuscules, plus de Markdown", () => {
  const texte = enTexte(extraireSection(JOURNAL, "0.3.0"));
  assert.match(texte, /^AJOUTÉ/);
  assert.match(texte, /- Fournisseurs et Machines deviennent des plugins, voir le guide\./);
  assert.doesNotMatch(texte, /\*\*|\]\(|###/);
  assert.equal(enTexte("Voir *Paramètres → Général* et `npm test`, 2 * 3 = 6"), "Voir Paramètres → Général et npm test, 2 * 3 = 6");
});

test("notesDeRelease : date en français et lien vers le journal", () => {
  const notes = notesDeRelease(JOURNAL, "0.3.0", "Bryan-Cordonnier/etabli");
  assert.match(notes, /^\*Publiée le 30\/09\/2026\.\*/);
  assert.match(notes, /Journal complet des changements\]\(https:\/\/github\.com\/Bryan-Cordonnier\/etabli\/blob\/main\/CHANGELOG\.md\)$/);
  assert.equal(notesDeRelease(JOURNAL, "9.9.9", "a/b"), null);
});
