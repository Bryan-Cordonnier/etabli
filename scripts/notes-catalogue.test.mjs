import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { actualiserNotes, corpsDeLaRelease, notesDuPlugin } from "./notes-catalogue.mjs";

const JOURNAL = `# Journal

## [Non publié]

## [1.1.0] — 2026-10-02

### Ajouté

- Une **nouveauté** visible.

## [1.0.0] — 2026-10-01

Première version.
`;

function avecPlugins(fonction) {
  const dossier = mkdtempSync(join(tmpdir(), "etabli-notes-"));
  try {
    mkdirSync(join(dossier, "beton"), { recursive: true });
    writeFileSync(join(dossier, "beton", "CHANGELOG.md"), JOURNAL, "utf8");
    mkdirSync(join(dossier, "sans-journal"), { recursive: true });
    return fonction(dossier);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

test("notesDuPlugin : texte brut de la version demandée, et sa date", () => {
  avecPlugins((dossier) => {
    const { notes, date } = notesDuPlugin("beton", "1.1.0", dossier);
    assert.match(notes, /^AJOUTÉ\n\n- Une nouveauté visible\.$/);
    assert.equal(date, "2026-10-02");
    assert.deepEqual(notesDuPlugin("beton", "9.9.9", dossier), { notes: "", date: null });
    assert.deepEqual(notesDuPlugin("sans-journal", "1.0.0", dossier), { notes: "", date: null });
  });
});

test("actualiserNotes : met à jour les entrées et compte les changements", () => {
  avecPlugins((dossier) => {
    const catalogue = { plugins: [{ id: "beton", version: "1.0.0" }, { id: "sans-journal", version: "1.0.0" }] };
    assert.equal(actualiserNotes(catalogue, dossier), 1);
    assert.equal(catalogue.plugins[0].notes, "Première version.");
    assert.equal(catalogue.plugins[0].notesDate, "2026-10-01");
    assert.equal(catalogue.plugins[1].notes, "");
    // Deuxième passage : plus rien à changer.
    assert.equal(actualiserNotes(catalogue, dossier), 0);
  });
});

test("corpsDeLaRelease : tableau des plugins puis nouveautés de chacun", () => {
  const corps = corpsDeLaRelease(
    {
      plugins: [
        { id: "tubes", name: "Tubes", version: "2.0.0", dependencies: { fournisseurs: "^1" }, optionalDependencies: {}, notes: "AJOUTÉ\n\n- Du neuf.", notesDate: "2026-10-02" },
        { id: "beton", name: "Béton", version: "1.0.0", notes: "" },
      ],
    },
    "a/b",
  );
  assert.match(corps, /\| Béton \| 1\.0\.0 \| — \| — \|/);
  assert.match(corps, /\| Tubes \| 2\.0\.0 \| fournisseurs \| — \|/);
  assert.match(corps, /## Tubes 2\.0\.0 \(02\/10\/2026\)\n\nAJOUTÉ\n\n- Du neuf\./);
  assert.match(corps, /_Pas de notes pour cette version\._/);
  assert.match(corps, /\(https:\/\/github\.com\/a\/b\/blob\/main\/plugins\/tubes\/CHANGELOG\.md\)/);
  assert.ok(corps.indexOf("Béton") < corps.indexOf("Tubes"), "triés par nom");
});
