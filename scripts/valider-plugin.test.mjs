import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { creerPlugin } from "./nouveau-plugin.mjs";
import { iconesConnues, validerPlugin } from "./valider-plugin.mjs";

const base = { id: "essai-plugin", nom: "Essai", couleur: "#123456", icone: "puzzle", reglages: false, date: "2026-10-01" };

/** Un plugin valide dans un dossier temporaire, modifié par `retouche`, puis validé. */
function valider(retouche = () => {}, options = {}) {
  const racine = mkdtempSync(join(tmpdir(), "etabli-valider-"));
  try {
    const { dossier } = creerPlugin({ ...base, ...options }, racine);
    const ecrire = (chemin, contenu) => {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu, "utf8");
    };
    retouche({ dossier, ecrire });
    return validerPlugin(dossier, { dist: false });
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
}

const modifierManifeste = (ecrire, dossier, changer) => {
  const chemin = join(dossier, "public", "manifest.json");
  const manifeste = JSON.parse(readFileSync(chemin, "utf8"));
  changer(manifeste);
  ecrire("public/manifest.json", JSON.stringify(manifeste));
};

const contient = (liste, motif) => liste.some((texte) => motif.test(texte));

test("les icônes viennent de icons.ts", () => {
  const icones = iconesConnues();
  assert.ok(icones.has("puzzle") && icones.has("hammer") && icones.has("circle-dot"));
  assert.ok(!icones.has("inconnue"));
});

test("un plugin neuf est valide", () => {
  assert.deepEqual(valider(), { erreurs: [], avertissements: [] });
});

test("manifeste : identifiant, version, couleur, icône, permissions", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.id = "autre";
      m.version = "1.0";
      m.color = "rouge";
      m.icon = "licorne";
      m.permissions = ["disque"];
    }),
  );
  assert.ok(contient(erreurs, /« id » vaut « autre »/));
  assert.ok(contient(erreurs, /« version » doit avoir la forme/));
  assert.ok(contient(erreurs, /« color »/));
  assert.ok(contient(erreurs, /« icon »/));
  assert.ok(contient(erreurs, /« permissions » : « disque » n'existe pas/));
});

test("permissions : doublon refusé, appel non déclaré refusé, déclaré accepté", () => {
  const source = 'import { saveFile, printFiche } from "@etabli/ui"; saveFile({}); printFiche({});\n';
  const sans = valider(({ dossier, ecrire }) => {
    modifierManifeste(ecrire, dossier, (m) => {
      m.permissions = ["fichiers", "fichiers"];
    });
    ecrire("src/export.ts", source);
  });
  assert.ok(contient(sans.erreurs, /« fichiers » est écrite deux fois/));
  assert.ok(contient(sans.erreurs, /exige la permission « impression »/));
  const avec = valider(({ dossier, ecrire }) => {
    modifierManifeste(ecrire, dossier, (m) => {
      m.permissions = ["fichiers", "impression", "presse-papiers"];
    });
    ecrire("src/export.ts", source);
  });
  assert.deepEqual(avec.erreurs, []);
});

test("un plugin de contrat ^1 reçoit un avertissement, pas une erreur", () => {
  const { erreurs, avertissements } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.apiVersion = "^1";
    }),
  );
  assert.deepEqual(erreurs, []);
  assert.ok(contient(avertissements, /permissions ne sont pas contrôlées/));
});

test("dépendances : plages, auto-dépendance, doublon, services", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.dependencies = { fournisseurs: "^1", "essai-plugin": "^1", machines: "n'importe quoi" };
      m.optionalDependencies = { fournisseurs: "^1" };
      m.provides = { "essai-plugin": 1 };
    }),
  );
  assert.ok(contient(erreurs, /ne peut pas dépendre de lui-même/));
  assert.ok(contient(erreurs, /« n'importe quoi » de « machines » est illisible/));
  assert.ok(contient(erreurs, /à la fois dans dependencies et optionalDependencies/));
  assert.ok(contient(erreurs, /version du contrat/));
});

test("plages de versions acceptées", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.dependencies = { a: "^1", b: "^1.2", c: "~1.2.3", d: "1.x", e: ">=1.2 <2", f: "*", g: "1.2.3" };
    }),
  );
  assert.deepEqual(erreurs, []);
});

test("journal des changements : absent, ou sans la section de la version", () => {
  assert.ok(contient(valider(({ dossier }) => rmSync(join(dossier, "CHANGELOG.md"))).erreurs, /CHANGELOG\.md est absent/));
  assert.ok(contient(valider(({ ecrire }) => ecrire("CHANGELOG.md", "# Journal\n\n## [Non publié]\n")).erreurs, /n'a pas de section « ## \[0\.1\.0\]/));
});

test("package.json : nom et version cohérents avec le manifeste", () => {
  const { erreurs } = valider(({ dossier, ecrire }) => {
    const p = JSON.parse(readFileSync(join(dossier, "package.json"), "utf8"));
    p.name = "autre-nom";
    p.version = "9.9.9";
    ecrire("package.json", JSON.stringify(p));
  });
  assert.ok(contient(erreurs, /« name » doit valoir « @etabli\/plugin-essai-plugin »/));
  assert.ok(contient(erreurs, /n'ont pas la même version/));
});

test("sources : appels réseau et exécution de code refusés, commentaires ignorés", () => {
  const { erreurs } = valider(({ ecrire }) => {
    ecrire("src/mauvais.ts", 'export const a = () => fetch("https://exemple.fr");\nexport const b = () => eval("1+1");\n');
    ecrire("src/commente.ts", '// on n\'utilise pas fetch("x") ici\n/* new WebSocket("ws://x") */\nexport const c = 1;\n');
    ecrire("apps/exemple/Faux.svelte", "<script>window.parent.postMessage(1, '*')</script>");
  });
  assert.ok(contient(erreurs, /src\/mauvais\.ts : appel réseau : fetch\(\)/));
  assert.ok(contient(erreurs, /src\/mauvais\.ts : exécution de texte comme du code : eval\(\)/));
  assert.ok(contient(erreurs, /Faux\.svelte/));
  assert.ok(!contient(erreurs, /commente\.ts/));
});

test("sources : une adresse externe est un avertissement, un espace de noms XML est toléré", () => {
  const { erreurs, avertissements } = valider(({ ecrire }) => {
    ecrire("src/liens.ts", 'export const site = "https://exemple.fr/page";\nexport const svg = "http://www.w3.org/2000/svg";\n');
  });
  assert.deepEqual(erreurs, []);
  assert.ok(contient(avertissements, /adresse externe https:\/\/exemple\.fr\/page/));
  assert.ok(!contient(avertissements, /w3\.org/));
});

test("mini-app dont l'entrée est absolue ou sort du plugin", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.miniApps[0].entry = "../autre/index.html";
    }),
  );
  assert.ok(contient(erreurs, /« entry » invalide/));
});

// ——— Appels entre plugins (docs/24, A.1.2) ———

/** Un plugin appelant valide : permission d'appel, plage de contrat, dépendance facultative. */
const appelant = (m) => {
  m.permissions = [...m.permissions, "appelle:finances:ecriture"];
  m.services = { finances: "^1" };
  m.optionalDependencies = { finances: "^1" };
};
/** Un plugin fournisseur valide : service publié, fonctions déclarées, point d'entrée. */
const fournisseur = (m) => {
  m.provides = { finances: "1" };
  m.functions = { finances: { "ecritures.ajouter": { acces: "ecriture" }, "soldes.aLaDate": { acces: "lecture" } } };
  m.serviceEntry = "service/index.html";
};

test("appels : un appelant et un fournisseur bien déclarés sont valides", () => {
  assert.deepEqual(valider(({ dossier, ecrire }) => modifierManifeste(ecrire, dossier, appelant)), { erreurs: [], avertissements: [] });
  const { erreurs } = valider(({ dossier, ecrire }) => modifierManifeste(ecrire, dossier, fournisseur));
  assert.deepEqual(erreurs, []);
});

test("appels : permission mal écrite, en double ou en contrat ^1", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.permissions = ["appelle:finances:tout", "appelle:Finances:lecture", "appelle:agenda:lecture", "appelle:agenda:lecture"];
    }),
  );
  assert.ok(contient(erreurs, /« appelle:finances:tout » n'existe pas/));
  assert.ok(contient(erreurs, /« appelle:Finances:lecture » n'existe pas/));
  assert.ok(contient(erreurs, /« appelle:agenda:lecture » est écrite deux fois/));
  const ancien = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      appelant(m);
      m.apiVersion = "^1";
    }),
  );
  assert.ok(contient(ancien.erreurs, /n'a d'effet que pour un plugin de contrat \^2/));
});

test("appels : la plage de contrat et la dépendance sont exigées avec la permission", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.permissions = ["appelle:finances:lecture"];
    }),
  );
  assert.ok(contient(erreurs, /« services » doit donner la plage de contrat de « finances »/));
  assert.ok(contient(erreurs, /déclarer le plugin fournisseur dans « dependencies » ou « optionalDependencies »/));
  const mauvais = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      appelant(m);
      m.services = { finances: "n'importe quoi" };
    }),
  );
  assert.ok(contient(mauvais.erreurs, /services : la plage « n'importe quoi »/));
});

test("appels : services.call sans permission d'appel est une erreur, avec permission non", () => {
  const code = 'export const go = (etabli) => etabli.services.call("finances", "soldes.aLaDate", {});\n';
  const sans = valider(({ ecrire }) => ecrire("src/appel.ts", code));
  assert.ok(contient(sans.erreurs, /src\/appel\.ts : appelle la fonction d'un autre plugin \(services\.call\) sans permission/));
  const avec = valider(({ dossier, ecrire }) => {
    modifierManifeste(ecrire, dossier, appelant);
    ecrire("src/appel.ts", code);
  });
  assert.deepEqual(avec.erreurs, []);
});

test("appels : functions exige un service publié, des noms valides, un accès connu et un serviceEntry", () => {
  const { erreurs } = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.provides = { finances: "1" };
      m.functions = { agenda: { "a.b": { acces: "lecture" } }, finances: { "Mauvais nom": { acces: "lecture" }, "ok.fonction": { acces: "admin" } } };
    }),
  );
  // « __proto__ » comme clé JSON (un littéral d'objet JavaScript ne la produirait pas).
  const proto = valider(({ dossier, ecrire }) => {
    modifierManifeste(ecrire, dossier, (m) => fournisseur(m));
    const chemin = join(dossier, "public", "manifest.json");
    ecrire("public/manifest.json", readFileSync(chemin, "utf8").replace('"ecritures.ajouter"', '"__proto__"'));
  });
  assert.ok(contient(proto.erreurs, /« __proto__ » n'est pas un nom de fonction valide/));
  assert.ok(contient(erreurs, /functions : le service « agenda » doit d'abord figurer dans « provides »/));
  assert.ok(contient(erreurs, /« Mauvais nom » n'est pas un nom de fonction valide/));
  assert.ok(contient(erreurs, /« finances\.ok\.fonction » doit déclarer "acces"/));
  assert.ok(contient(erreurs, /« functions » demande un « serviceEntry »/));
});

test("appels : serviceEntry doit rester dans le plugin ; sans fonctions il n'a pas d'objet", () => {
  const sort = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      fournisseur(m);
      m.serviceEntry = "../autre/index.html";
    }),
  );
  assert.ok(contient(sort.erreurs, /« serviceEntry » invalide/));
  const vide = valider(({ dossier, ecrire }) =>
    modifierManifeste(ecrire, dossier, (m) => {
      m.serviceEntry = "service/index.html";
    }),
  );
  assert.ok(contient(vide.avertissements, /« serviceEntry » est déclaré mais « functions » est vide/));
});

test("appels : services.handle sans functions ni serviceEntry est une erreur", () => {
  const { erreurs } = valider(({ ecrire }) => ecrire("service/main.ts", 'export const go = (etabli) => etabli.services.handle("finances", {});\n'));
  assert.ok(contient(erreurs, /service\/main\.ts : répond à des appels \(services\.handle\)/));
});
