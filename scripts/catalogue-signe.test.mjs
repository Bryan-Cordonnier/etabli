import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FORMAT, VALIDITE_SECONDES, ecrireEtSigner, preparerCatalogue, renouveler } from "./catalogue-signe.mjs";

const MAINTENANT = 1_790_000_000;

test("un ancien catalogue passe au format 2 sans perdre ses plugins", () => {
  const ancien = { format: 1, plugins: [{ id: "maths", version: "1.0.0" }, { id: "tracage", version: "1.1.1" }] };
  const prepare = preparerCatalogue(ancien, MAINTENANT);
  assert.equal(prepare.format, FORMAT);
  assert.equal(prepare.sequence, 1);
  assert.equal(prepare.expire, MAINTENANT + VALIDITE_SECONDES);
  assert.deepEqual(prepare.plugins, ancien.plugins);
  assert.deepEqual(prepare.revocations, []);
});

test("la séquence augmente toujours et les révocations sont gardées", () => {
  const revocations = [{ id: "tracage", avant: "1.2.0", raison: "faille" }];
  const a = preparerCatalogue({ format: 2, sequence: 41, plugins: [], revocations }, MAINTENANT);
  assert.equal(a.sequence, 42);
  assert.deepEqual(a.revocations, revocations);
  const b = preparerCatalogue(a, MAINTENANT + 10);
  assert.equal(b.sequence, 43);
  assert.ok(b.expire > a.expire);
});

test("un catalogue absent, vide ou abîmé repart de la séquence 1", () => {
  for (const mauvais of [undefined, null, {}, { sequence: -3 }, { sequence: "x" }, { sequence: 1.5 }, { plugins: "non", revocations: 3 }]) {
    const p = preparerCatalogue(mauvais, MAINTENANT);
    assert.equal(p.sequence, 1, JSON.stringify(mauvais));
    assert.deepEqual(p.plugins, []);
    assert.deepEqual(p.revocations, []);
  }
});

test("le fichier est écrit puis signé, et la signature porte sur les octets exacts du fichier", () => {
  const dossier = mkdtempSync(join(tmpdir(), "etabli-catalogue-"));
  try {
    const fichier = join(dossier, "catalogue.json");
    writeFileSync(fichier, JSON.stringify({ format: 1, plugins: [{ id: "maths", version: "1.0.0" }] }));
    let vu;
    const sequence = renouveler(fichier, MAINTENANT, (f) => {
      // Au moment de signer, le fichier est déjà dans son état définitif.
      vu = readFileSync(f);
      writeFileSync(`${f}.minisig`, "signature-factice");
    });
    assert.equal(sequence, 1);
    assert.deepEqual(readFileSync(fichier), vu);
    const lu = JSON.parse(readFileSync(fichier, "utf8"));
    assert.equal(lu.format, 2);
    assert.equal(lu.plugins[0].id, "maths");
    assert.ok(existsSync(`${fichier}.minisig`));
    assert.ok(readFileSync(fichier, "utf8").endsWith("\n"));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test("ecrireEtSigner renvoie l'emplacement de la signature", () => {
  const dossier = mkdtempSync(join(tmpdir(), "etabli-catalogue-"));
  try {
    const fichier = join(dossier, "c.json");
    assert.equal(ecrireEtSigner(fichier, preparerCatalogue({}, MAINTENANT), () => {}), `${fichier}.minisig`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
