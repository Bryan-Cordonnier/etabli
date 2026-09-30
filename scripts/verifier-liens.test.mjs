import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ancre, ancres, liens, verifier } from "./verifier-liens.mjs";

test("ancre : comme GitHub (accents gardés, ponctuation retirée)", () => {
  assert.equal(ancre("Écrire un plugin"), "écrire-un-plugin");
  assert.equal(ancre("Dépendances et services"), "dépendances-et-services");
  assert.equal(ancre("Publier un plugin (pas à pas)"), "publier-un-plugin-pas-à-pas");
  assert.equal(ancre("Le `CHANGELOG.md` et **vous**"), "le-changelogmd-et-vous");
  assert.equal(ancre("[Lien](x.md) dans un titre"), "lien-dans-un-titre");
});

test("ancres : doublons numérotés, blocs de code ignorés", () => {
  const liste = ancres("# Titre\n\n## Suite\n\n## Suite\n\n```\n# pas un titre\n```\n");
  assert.deepEqual([...liste], ["titre", "suite", "suite-1"]);
});

test("liens : Markdown, images et HTML, sans les adresses externes ni le code", () => {
  const trouves = liens('Voir [le guide](docs/g.md#a) et ![image](img/x.png), <a href="autre.md">x</a> <img src="i.png">,\n[web](https://exemple.fr) `[code](non.md)`\n```\n[bloc](non.md)\n```\n');
  assert.deepEqual(trouves.map((l) => l.cible), ["docs/g.md#a", "img/x.png", "autre.md", "i.png"]);
});

test("verifier : fichiers et ancres", () => {
  const racine = mkdtempSync(join(tmpdir(), "etabli-liens-"));
  try {
    const ecrire = (chemin, contenu) => {
      mkdirSync(dirname(join(racine, chemin)), { recursive: true });
      writeFileSync(join(racine, chemin), contenu, "utf8");
    };
    ecrire("README.md", "# Accueil\n[ok](docs/guide.md#installer) [ancre locale](#accueil) [absent](docs/nulle-part.md) [mauvaise](docs/guide.md#inconnue) ![img](docs/i.png)\n");
    ecrire("docs/guide.md", "# Guide\n\n## Installer\n\n[retour](../README.md#accueil)\n");
    ecrire("docs/i.png", "x");
    const problemes = verifier(racine);
    assert.equal(problemes.length, 2);
    assert.match(problemes[0], /README\.md:2 : « docs\/nulle-part\.md » : fichier introuvable/);
    assert.match(problemes[1], /« docs\/guide\.md#inconnue » : cette ancre n'existe pas/);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});
