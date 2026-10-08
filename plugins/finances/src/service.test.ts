import { describe, expect, it } from "vitest";
import manifeste from "../public/manifest.json";
import { LIMITE_OCTETS, lireRegistre, registreVide, tailleOctets } from "./registre";
import { FONCTIONS, executer } from "./service";
import { ErreurFinances, type Ecriture, type Registre } from "./types";

const utc = (a: number, m: number, j: number, h = 0, min = 0) => Date.UTC(a, m - 1, j, h, min);
const MAINTENANT = utc(2026, 10, 5, 8, 0); // lundi 5 octobre 2026, 10 h à Paris

/** Un banc d'essai qui joue « un appel = un cadre neuf » : le registre passe par du JSON entre deux appels, rien n'est gardé en mémoire. */
class Banc {
  enregistre: unknown = null;
  appels = 0;
  constructor(public maintenant = MAINTENANT) {}
  appeler(fonction: string, args: unknown, appelant = "paie") {
    this.appels++;
    const r = executer(JSON.parse(JSON.stringify(this.enregistre)), fonction, args, appelant, this.maintenant);
    if (r.registre) this.enregistre = JSON.parse(JSON.stringify(r.registre));
    return r.valeur as any;
  }
  refus(fonction: string, args: unknown, appelant = "paie"): ErreurFinances {
    const avant = JSON.stringify(this.enregistre);
    try {
      this.appeler(fonction, args, appelant);
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurFinances);
      expect(JSON.stringify(this.enregistre), "un refus ne modifie rien").toBe(avant);
      return e as ErreurFinances;
    }
    throw new Error(`« ${fonction} » aurait dû être refusé`);
  }
  get registre(): Registre {
    return lireRegistre(this.enregistre);
  }
}

function banc(): { b: Banc; compte: string; courses: string; salaire: string } {
  const b = new Banc();
  const compte = b.appeler("comptes.creer", { nom: "Compte courant", type: "courant", soldeInitialCents: 100000, ouvertLe: "2026-10-01", cle: "c1" }, "@utilisateur").id;
  const courses = b.appeler("categories.creer", { nom: "Courses", sens: "sortie", cle: "k1" }, "@utilisateur").id;
  const salaire = b.appeler("categories.creer", { nom: "Salaire", sens: "entree", cle: "k2" }, "@utilisateur").id;
  return { b, compte, courses, salaire };
}

const ecr = (compteId: string, montantCents: number, quand: number, cle: string, extra: object = {}) => ({ compteId, montantCents, quand, libelle: "Test", cle, ...extra });

describe("le manifeste et le service disent la même chose", () => {
  it("chaque fonction du manifeste existe dans le service, avec le même niveau d'accès", () => {
    const declare = (manifeste as any).functions.finances as Record<string, { acces: string }>;
    expect(Object.fromEntries(Object.entries(declare).map(([k, v]) => [k, v.acces]))).toEqual(FONCTIONS);
    expect((manifeste as any).provides).toEqual({ finances: "1" });
    expect((manifeste as any).serviceEntry).toBe("service/index.html");
  });
  it("permissions minimales : aucune (ni fichiers, ni réseau, ni appel d'un autre plugin)", () => {
    expect((manifeste as any).permissions).toEqual([]);
    expect((manifeste as any).apiVersion).toBe("^3");
  });
  it("une fonction inconnue (ou un nom hérité d'Object) est introuvable", () => {
    const b = new Banc();
    for (const nom of ["ecritures.supprimer", "constructor", "__proto__", "toString", ""]) expect(b.refus(nom, null).code, nom).toBe("introuvable");
  });
});

describe("comptes et catégories", () => {
  it("crée, liste (sans la clé interne) et rejoue sans doublon", () => {
    const { b, compte } = banc();
    const rejeu = b.appeler("comptes.creer", { nom: "Compte courant", type: "courant", soldeInitialCents: 100000, ouvertLe: "2026-10-01", cle: "c1" }, "@utilisateur");
    expect(rejeu).toEqual({ id: compte, rejoue: true });
    const liste = b.appeler("comptes.liste", null);
    expect(liste).toEqual([{ id: compte, nom: "Compte courant", type: "courant", soldeInitialCents: 100000, ouvertLe: "2026-10-01", archive: false, source: "@utilisateur" }]);
    expect(JSON.stringify(b.appeler("categories.liste", undefined))).not.toContain('"cle"');
    expect(b.registre.comptes).toHaveLength(1);
  });
  it("la date d'ouverture par défaut est le jour courant à Paris", () => {
    const b = new Banc(utc(2026, 10, 4, 22, 30)); // déjà le 5 octobre à Paris
    const id = b.appeler("comptes.creer", { nom: "A", type: "especes", soldeInitialCents: 0, cle: "a" }).id;
    expect(b.registre.comptes.find((c) => c.id === id)!.ouvertLe).toBe("2026-10-05");
  });
  it("refuse un nom déjà pris (sans tenir compte des majuscules), un type inconnu, un solde non entier", () => {
    const { b } = banc();
    expect(b.refus("comptes.creer", { nom: "compte COURANT", type: "courant", soldeInitialCents: 0, cle: "x" }).code).toBe("argument_invalide");
    expect(b.refus("comptes.creer", { nom: "B", type: "bitcoin", soldeInitialCents: 0, cle: "x" }).code).toBe("argument_invalide");
    for (const solde of [12.5, "1250", NaN, Infinity, 1e13, null]) expect(b.refus("comptes.creer", { nom: "B", type: "courant", soldeInitialCents: solde, cle: "x" }).code, String(solde)).toBe("argument_invalide");
    expect(b.refus("comptes.creer", { nom: "B", type: "courant", soldeInitialCents: 0, cle: "x", ouvertLe: "2026-02-30" }).code).toBe("argument_invalide");
  });
  it("une clé réutilisée avec d'autres données est un refus, pas un rejeu", () => {
    const { b } = banc();
    const e = b.refus("comptes.creer", { nom: "Autre", type: "courant", soldeInitialCents: 5, cle: "c1" }, "@utilisateur");
    expect(e.code).toBe("argument_invalide");
    expect(e.message).toContain("clé");
  });
  it("la même clé chez deux appelants différents ne se confond pas", () => {
    const { b } = banc();
    const id = b.appeler("comptes.creer", { nom: "Épargne", type: "epargne", soldeInitialCents: 0, cle: "c1" }, "budget");
    expect(id.rejoue).toBe(false);
    expect(b.registre.comptes).toHaveLength(2);
  });
  it("catégories : deux niveaux seulement, parent connu, couleur valide, nom unique à l'endroit", () => {
    const { b, courses } = banc();
    const sous = b.appeler("categories.creer", { nom: "Marché", sens: "sortie", parentId: courses, couleur: "#12ab34", cle: "k3" }, "@utilisateur").id;
    expect(b.refus("categories.creer", { nom: "Bio", sens: "sortie", parentId: sous, cle: "k4" }).code).toBe("argument_invalide");
    expect(b.refus("categories.creer", { nom: "X", sens: "sortie", parentId: "k99", cle: "k5" }).code).toBe("introuvable");
    expect(b.refus("categories.creer", { nom: "X", sens: "sortie", couleur: "rouge", cle: "k6" }).code).toBe("argument_invalide");
    expect(b.refus("categories.creer", { nom: "courses", sens: "sortie", cle: "k7" }).code).toBe("argument_invalide");
    expect(b.refus("categories.creer", { nom: "X", sens: "partout", cle: "k8" }).code).toBe("argument_invalide");
  });
});

describe("ajouter une écriture : validation stricte", () => {
  it("ajoute, et le jour civil est celui du fuseau figé (Paris)", () => {
    const { b, compte, courses } = banc();
    const r = b.appeler("ecritures.ajouter", ecr(compte, -4520, utc(2026, 10, 4, 22, 30), "e1", { categorieId: courses, ref: "ticket-12" }));
    expect(r).toEqual({ id: "e4", rejoue: false });
    const e = b.registre.ecritures[0]!;
    expect(e).toMatchObject({ jour: "2026-10-05", fuseau: "Europe/Paris", source: "paie", ref: "ticket-12", annule: null, creeLe: MAINTENANT, categorieId: courses });
  });
  it("la source est imposée par le moteur : un champ « source » dans les arguments est refusé", () => {
    const { b, compte } = banc();
    for (const champ of [{ source: "banque" }, { appelant: "banque" }, { id: "e1" }, { __proto__x: 1 }]) {
      expect(b.refus("ecritures.ajouter", ecr(compte, -100, MAINTENANT, "s", champ)).code).toBe("argument_invalide");
    }
    expect(b.refus("ecritures.ajouter", JSON.parse('{"compteId":"c1","montantCents":-1,"quand":1,"libelle":"x","cle":"k","__proto__":{"source":"x"}}')).code).toBe("argument_invalide");
    expect(b.registre.ecritures).toHaveLength(0);
  });
  it("refuse tout ce qui n'est pas un montant entier de centimes", () => {
    const { b, compte } = banc();
    for (const m of [0, 12.5, "12,50", NaN, null, undefined, 1e12 + 1, "100", true, [], {}]) {
      expect(b.refus("ecritures.ajouter", ecr(compte, m as number, MAINTENANT, "m")).code, String(m)).toBe("argument_invalide");
    }
  });
  it("refuse un instant invalide, un libellé vide ou trop long, des arguments qui ne sont pas un objet", () => {
    const { b, compte } = banc();
    for (const q of [1.5, -1, "2026-10-05", NaN, null]) expect(b.refus("ecritures.ajouter", ecr(compte, -1, q as number, "q")).code).toBe("argument_invalide");
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT, "q", { libelle: "   " })).code).toBe("argument_invalide");
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT, "q", { libelle: "x".repeat(201) })).code).toBe("argument_invalide");
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT, "q", { libelle: "a\nb" })).code).toBe("argument_invalide");
    for (const args of [null, undefined, "texte", 42, [], [ecr(compte, -1, MAINTENANT, "q")]]) expect(b.refus("ecritures.ajouter", args).code).toBe("argument_invalide");
    for (const k of ["", "a b", "x".repeat(121), 12, null]) expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT, k as string)).code, String(k)).toBe("argument_invalide");
    expect(b.refus("ecritures.ajouter", { compteId: compte, montantCents: -1, quand: MAINTENANT, cle: "q" }).message).toContain("libelle");
  });
  it("compte ou catégorie inconnus : introuvable ; compte archivé : refusé", () => {
    const { b, compte } = banc();
    expect(b.refus("ecritures.ajouter", ecr("c99", -1, MAINTENANT, "q")).code).toBe("introuvable");
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT, "q", { categorieId: "k99" })).code).toBe("introuvable");
    expect(b.refus("ecritures.ajouter", ecr("pas un id", -1, MAINTENANT, "q")).code).toBe("argument_invalide");
    const r = b.registre;
    r.comptes[0]!.archive = true;
    b.enregistre = r;
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT, "q")).message).toContain("archivé");
  });
  it("le sens de la catégorie est respecté", () => {
    const { b, compte, courses, salaire } = banc();
    expect(b.refus("ecritures.ajouter", ecr(compte, 500, MAINTENANT, "q1", { categorieId: courses })).code).toBe("argument_invalide");
    expect(b.refus("ecritures.ajouter", ecr(compte, -500, MAINTENANT, "q2", { categorieId: salaire })).code).toBe("argument_invalide");
    b.appeler("ecritures.ajouter", ecr(compte, 150000, MAINTENANT, "q3", { categorieId: salaire }));
  });
  it("Finances ne garde que le réel : pas dans le futur, pas avant l'ouverture du compte, pas avant 2000", () => {
    const { b, compte } = banc();
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, MAINTENANT + 2 * 86_400_000, "f")).message).toContain("futur");
    b.appeler("ecritures.ajouter", ecr(compte, -1, MAINTENANT + 3_600_000, "f2")); // une heure d'avance : tolérée (décalage d'horloge)
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, utc(2026, 9, 30, 12), "av")).message).toContain("pas encore");
    expect(b.refus("ecritures.ajouter", ecr(compte, -1, utc(1999, 12, 31, 12), "an")).code).toBe("argument_invalide");
  });
  it("le solde ne peut pas sortir des limites de l'argent (±10 milliards d'euros)", () => {
    const { b, compte } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, 1e12 - 100000, MAINTENANT, "g1"));
    expect(b.refus("ecritures.ajouter", ecr(compte, 1, MAINTENANT, "g2")).message).toContain("limite");
  });
});

describe("idempotence des écritures", () => {
  it("rejouer le même appel ne crée rien et rend le même identifiant", () => {
    const { b, compte } = banc();
    const a = b.appeler("ecritures.ajouter", ecr(compte, -2500, MAINTENANT, "paie-oct"));
    const avant = JSON.stringify(b.enregistre);
    const r = b.appeler("ecritures.ajouter", ecr(compte, -2500, MAINTENANT, "paie-oct"));
    expect(r).toEqual({ id: a.id, rejoue: true });
    expect(JSON.stringify(b.enregistre)).toBe(avant);
  });
  it("même clé, autre montant : refus", () => {
    const { b, compte } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, -2500, MAINTENANT, "paie-oct"));
    expect(b.refus("ecritures.ajouter", ecr(compte, -2600, MAINTENANT, "paie-oct")).message).toContain("clé");
  });
  it("la clé d'un plugin ne couvre pas celle d'un autre", () => {
    const { b, compte } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, -2500, MAINTENANT, "k"), "paie");
    expect(b.appeler("ecritures.ajouter", ecr(compte, -2500, MAINTENANT, "k"), "budget").rejoue).toBe(false);
    expect(b.registre.ecritures).toHaveLength(2);
  });
});

describe("annulation par écriture inverse", () => {
  function avecEcritures() {
    const base = banc();
    const { b, compte } = base;
    const a = b.appeler("ecritures.ajouter", ecr(compte, -2500, utc(2026, 10, 2, 10), "e-a")).id; // 2 octobre
    const c = b.appeler("ecritures.ajouter", ecr(compte, 30000, utc(2026, 10, 3, 10), "e-c")).id; // 3 octobre
    return { ...base, a, c };
  }
  it("l'inverse a le même compte, le même instant et le montant opposé ; l'original reste", () => {
    const { b, a } = avecEcritures();
    const r = b.appeler("ecritures.annuler", { id: a, motif: "saisie en double", cle: "an-1" });
    expect(r.rejoue).toBe(false);
    const [orig, , inverse] = b.registre.ecritures;
    expect(orig!.id).toBe(a);
    expect(inverse).toMatchObject({ compteId: orig!.compteId, montantCents: 2500, quand: orig!.quand, jour: "2026-10-02", annule: a, motif: "saisie en double", source: "paie", creeLe: MAINTENANT });
    expect(inverse!.libelle).toBe("Annulation : Test");
    expect(b.registre.ecritures).toHaveLength(3);
  });
  it("les soldes de TOUTES les dates redeviennent ceux d'avant l'erreur", () => {
    const { b, compte, a } = avecEcritures();
    const jours = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"];
    const avant = jours.map((j) => b.appeler("soldes.aLaDate", { jour: j })[compte]);
    expect(avant).toEqual([0, 100000, 97500, 127500, 127500]);
    b.appeler("ecritures.annuler", { id: a, motif: "erreur", cle: "an-1" });
    expect(jours.map((j) => b.appeler("soldes.aLaDate", { jour: j })[compte])).toEqual([0, 100000, 100000, 130000, 130000]);
  });
  it("rejeu : même clé, même résultat, rien de plus", () => {
    const { b, a } = avecEcritures();
    const r1 = b.appeler("ecritures.annuler", { id: a, motif: "erreur", cle: "an-1" });
    const r2 = b.appeler("ecritures.annuler", { id: a, motif: "erreur", cle: "an-1" });
    expect(r2).toEqual({ id: r1.id, rejoue: true });
    expect(b.registre.ecritures).toHaveLength(3);
  });
  it("une écriture ne s'annule qu'une fois (avec une autre clé : refus) et une annulation ne s'annule pas", () => {
    const { b, a } = avecEcritures();
    const r = b.appeler("ecritures.annuler", { id: a, motif: "erreur", cle: "an-1" });
    expect(b.refus("ecritures.annuler", { id: a, motif: "encore", cle: "an-2" }).message).toContain("déjà annulée");
    expect(b.refus("ecritures.annuler", { id: r.id, motif: "oups", cle: "an-3" }).message).toContain("ne s'annule pas");
  });
  it("un plugin n'annule que SES écritures ; inconnue : introuvable", () => {
    const { b, a } = avecEcritures();
    const e = b.refus("ecritures.annuler", { id: a, motif: "je triche", cle: "x" }, "budget");
    expect(e.code).toBe("permission_refusee");
    expect(b.refus("ecritures.annuler", { id: "e999", motif: "?", cle: "x" }).code).toBe("introuvable");
    expect(b.refus("ecritures.annuler", { id: a, cle: "x" }).code).toBe("argument_invalide");
  });
  it("dans les totaux par catégorie, l'écriture et son annulation s'annulent", () => {
    const { b, compte, courses } = banc();
    const e = b.appeler("ecritures.ajouter", ecr(compte, -4000, utc(2026, 10, 2, 10), "z", { categorieId: courses })).id;
    expect(b.appeler("totaux.parCategorie", { du: "2026-10-01", au: "2026-10-31", sens: "sortie" })).toEqual([{ categorieId: courses, cents: -4000 }]);
    b.appeler("ecritures.annuler", { id: e, motif: "erreur", cle: "z-" });
    expect(b.appeler("totaux.parCategorie", { du: "2026-10-01", au: "2026-10-31" })).toEqual([{ categorieId: courses, cents: 0 }]);
    // Avec un sens, la paire disparaît des DEUX côtés : la dépense annulée n'est plus comptée, l'annulation n'est pas une recette.
    expect(b.appeler("totaux.parCategorie", { du: "2026-10-01", au: "2026-10-31", sens: "sortie" })).toEqual([]);
    expect(b.appeler("totaux.parCategorie", { du: "2026-10-01", au: "2026-10-31", sens: "entree" })).toEqual([]);
  });
});

describe("lectures : soldes, série, totaux, liste", () => {
  it("solde : 0 avant l'ouverture, solde initial le jour de l'ouverture, écritures ensuite", () => {
    const { b, compte } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, -999, utc(2026, 10, 3, 12), "a"));
    expect(b.appeler("soldes.aLaDate", { jour: "2026-09-30" })).toEqual({ [compte]: 0 });
    expect(b.appeler("soldes.aLaDate", { jour: "2026-10-01" })).toEqual({ [compte]: 100000 });
    expect(b.appeler("soldes.aLaDate", { jour: "2026-10-03" })).toEqual({ [compte]: 99001 });
    expect(b.appeler("soldes.aLaDate", { jour: "2026-10-03", comptes: [compte] })).toEqual({ [compte]: 99001 });
    expect(b.refus("soldes.aLaDate", { jour: "2026-10-03", comptes: ["c42"] }).code).toBe("introuvable");
    expect(b.refus("soldes.aLaDate", { jour: "2026-13-03" }).code).toBe("argument_invalide");
    expect(b.refus("soldes.aLaDate", {}).code).toBe("argument_invalide");
  });
  it("la série porte une valeur par jour, les jours sans mouvement sont reportés, un compte ouvert en cours de route entre au bon jour", () => {
    const { b, compte } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, -1000, utc(2026, 10, 3, 12), "a"));
    const autre = b.appeler("comptes.creer", { nom: "Livret", type: "epargne", soldeInitialCents: 50000, ouvertLe: "2026-10-04", cle: "l" }, "@utilisateur").id;
    b.appeler("ecritures.ajouter", ecr(autre, 200, utc(2026, 10, 5, 7), "b"));
    const s = b.appeler("serie.parJour", { du: "2026-09-30", au: "2026-10-05" });
    expect(s).toEqual([
      { jour: "2026-09-30", soldeCents: 0 },
      { jour: "2026-10-01", soldeCents: 100000 },
      { jour: "2026-10-02", soldeCents: 100000 },
      { jour: "2026-10-03", soldeCents: 99000 },
      { jour: "2026-10-04", soldeCents: 149000 },
      { jour: "2026-10-05", soldeCents: 149200 },
    ]);
    expect(b.appeler("serie.parJour", { du: "2026-10-03", au: "2026-10-05", comptes: [compte] }).map((p: any) => p.soldeCents)).toEqual([99000, 99000, 99000]);
    // Chaque point de la série vaut la somme des soldes à la date.
    for (const p of s) expect(Object.values(b.appeler("soldes.aLaDate", { jour: p.jour })).reduce((x: number, y: any) => x + y, 0)).toBe(p.soldeCents);
  });
  it("fenêtres : plus de 1 830 jours = limite_atteinte ; à l'envers ou invalide = argument_invalide", () => {
    const { b } = banc();
    expect(b.refus("serie.parJour", { du: "2020-01-01", au: "2026-01-01" }).code).toBe("limite_atteinte");
    expect(b.appeler("serie.parJour", { du: "2026-01-01", au: "2030-12-30" })).toHaveLength(1825);
    expect(b.refus("serie.parJour", { du: "2026-10-05", au: "2026-10-01" }).code).toBe("argument_invalide");
    expect(b.refus("totaux.parCategorie", { du: "2020-01-01", au: "2026-01-01" }).code).toBe("limite_atteinte");
    expect(b.refus("totaux.parCategorie", { du: "2026-01-01", au: "2026-02-01", sens: "autre" }).code).toBe("argument_invalide");
  });
  it("totaux par catégorie : entrées, sorties, sans catégorie, tri par valeur absolue", () => {
    const { b, compte, courses, salaire } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, -4000, utc(2026, 10, 2, 10), "a", { categorieId: courses }));
    b.appeler("ecritures.ajouter", ecr(compte, -1500, utc(2026, 10, 3, 10), "b", { categorieId: courses }));
    b.appeler("ecritures.ajouter", ecr(compte, -700, utc(2026, 10, 3, 11), "c"));
    b.appeler("ecritures.ajouter", ecr(compte, 120000, utc(2026, 10, 4, 10), "d", { categorieId: salaire }));
    const fen = { du: "2026-10-01", au: "2026-10-31" };
    expect(b.appeler("totaux.parCategorie", { ...fen, sens: "sortie" })).toEqual([{ categorieId: courses, cents: -5500 }, { categorieId: null, cents: -700 }]);
    expect(b.appeler("totaux.parCategorie", { ...fen, sens: "entree" })).toEqual([{ categorieId: salaire, cents: 120000 }]);
    expect(b.appeler("totaux.parCategorie", { ...fen })[0]).toEqual({ categorieId: salaire, cents: 120000 });
    expect(b.appeler("totaux.parCategorie", { du: "2026-11-01", au: "2026-11-30" })).toEqual([]);
  });
  it("liste : filtres, ordre chronologique, source, sans clé interne", () => {
    const { b, compte, courses } = banc();
    b.appeler("ecritures.ajouter", ecr(compte, -300, utc(2026, 10, 3, 10), "x", { categorieId: courses }), "paie");
    b.appeler("ecritures.ajouter", ecr(compte, -100, utc(2026, 10, 2, 10), "y"), "budget");
    const tout = b.appeler("ecritures.liste", {});
    expect(tout.ecritures.map((e: any) => e.montantCents)).toEqual([-100, -300]); // chronologique, pas dans l'ordre de saisie
    expect(tout.curseur).toBeUndefined();
    expect(JSON.stringify(tout)).not.toContain('"cle"');
    expect(b.appeler("ecritures.liste", { source: "paie" }).ecritures).toHaveLength(1);
    expect(b.appeler("ecritures.liste", { categorieId: courses }).ecritures).toHaveLength(1);
    expect(b.appeler("ecritures.liste", { du: "2026-10-03" }).ecritures).toHaveLength(1);
    expect(b.appeler("ecritures.liste", { au: "2026-10-02" }).ecritures).toHaveLength(1);
    expect(b.appeler("ecritures.liste", null).ecritures).toHaveLength(2);
    expect(b.refus("ecritures.liste", { compteId: "c42" }).code).toBe("introuvable");
    expect(b.refus("ecritures.liste", { curseur: "n'importe quoi" }).code).toBe("argument_invalide");
    expect(b.refus("ecritures.liste", { page: 2 }).code).toBe("argument_invalide");
  });
  it("liste : pages de 1 000 avec curseur, sans trou ni doublon, même à instant égal", () => {
    const { b, compte } = banc();
    const reg = b.registre;
    const lot: Ecriture[] = [];
    for (let i = 0; i < 2305; i++) {
      // Beaucoup d'écritures au même instant : le curseur doit départager par numéro de création.
      lot.push({ id: `e${100 + i}`, compteId: compte, montantCents: -1, quand: utc(2026, 10, 3, 10) + Math.floor(i / 7) * 1000, fuseau: "Europe/Paris", jour: "2026-10-03", categorieId: null, libelle: "L", source: "paie", ref: null, annule: null, motif: null, creeLe: 0, cle: `k${i}` });
    }
    reg.ecritures = lot.reverse(); // désordre volontaire
    reg.suivant = 5000;
    b.enregistre = reg;
    const vus: string[] = [];
    let curseur: string | undefined;
    let pages = 0;
    do {
      const p: any = b.appeler("ecritures.liste", curseur ? { curseur } : {});
      expect(p.ecritures.length).toBeLessThanOrEqual(1000);
      vus.push(...p.ecritures.map((e: any) => e.id));
      curseur = p.curseur;
      pages++;
    } while (curseur);
    expect(pages).toBe(3);
    expect(vus).toHaveLength(2305);
    expect(new Set(vus).size).toBe(2305);
  });
});

describe("registre : lecture prudente et limite de taille", () => {
  it("rien d'enregistré = registre vide ; des données illisibles = erreur, jamais un registre vide qui écraserait tout", () => {
    expect(lireRegistre(null)).toEqual(registreVide());
    for (const abime of [42, "texte", [], { schema: 2 }, { schema: 1 }, { schema: 1, fuseau: "Europe/Paris", suivant: 1, comptes: [{}], categories: [], ecritures: [] }]) {
      expect(() => lireRegistre(abime), JSON.stringify(abime)).toThrow(ErreurFinances);
    }
    const b = new Banc();
    b.enregistre = { schema: 9, quoi: "plus tard" };
    const e = b.refus("comptes.creer", { nom: "A", type: "courant", soldeInitialCents: 0, cle: "a" });
    expect(e.code).toBe("erreur");
    expect(e.message).toContain("illisible");
    expect(b.refus("comptes.liste", null).code).toBe("erreur");
  });
  it("à la limite de taille, l'écriture est refusée avec une erreur claire et RIEN n'est modifié", () => {
    const { b, compte } = banc();
    const reg = b.registre;
    const gabarit = (i: number): Ecriture => ({
      id: `e${1000 + i}`, compteId: compte, montantCents: -1, quand: utc(2026, 10, 3, 10), fuseau: "Europe/Paris", jour: "2026-10-03", categorieId: null,
      libelle: "x".repeat(150), source: "paie", ref: null, annule: null, motif: null, creeLe: 0, cle: `cle-${i}`,
    });
    const taille = tailleOctets({ ...reg, ecritures: [gabarit(0)] }) - tailleOctets(reg);
    reg.ecritures = Array.from({ length: Math.floor((LIMITE_OCTETS - tailleOctets(reg)) / taille) - 3 }, (_, i) => gabarit(i));
    reg.suivant = 20_000;
    // Ajuste au plus près de la limite (la taille d'une écriture varie un peu avec la longueur des identifiants).
    for (let reglage = 0; reglage < 6 && tailleOctets(reg) > LIMITE_OCTETS - 800; reglage++) {
      reg.ecritures.length -= Math.max(1, Math.ceil((tailleOctets(reg) - (LIMITE_OCTETS - 800)) / taille));
    }
    expect(tailleOctets(reg)).toBeLessThan(LIMITE_OCTETS);
    expect(tailleOctets(reg)).toBeGreaterThan(LIMITE_OCTETS - 5000);
    b.enregistre = reg;
    let refuse: ErreurFinances | null = null;
    for (let i = 0; i < 40 && !refuse; i++) {
      try {
        b.appeler("ecritures.ajouter", ecr(compte, -1, MAINTENANT, `plein-${i}`, { libelle: "y".repeat(150) }));
      } catch (e) {
        refuse = e as ErreurFinances;
      }
    }
    expect(refuse?.code).toBe("limite_atteinte");
    expect(refuse?.message).toMatch(/plein.*Rien n'a été enregistré/);
    expect(tailleOctets(b.registre)).toBeLessThanOrEqual(LIMITE_OCTETS);
    // Les lectures et les rejeux restent possibles.
    expect(b.appeler("comptes.liste", null)).toHaveLength(1);
    const n = b.registre.ecritures.length;
    b.appeler("ecritures.ajouter", ecr(compte, -1, MAINTENANT, "plein-0", { libelle: "y".repeat(150) }));
    expect(b.registre.ecritures).toHaveLength(n);
  });
  it("le plafond laisse de la marge sous les 4 Mo du moteur", () => {
    expect(LIMITE_OCTETS).toBeLessThan(4 * 1024 * 1024);
  });
});

describe("scénario : un mois d'argent réel", () => {
  it("les soldes se recoupent entre soldes.aLaDate, serie.parJour et la somme des écritures", () => {
    const { b, compte, courses, salaire } = banc();
    const faits: [number, number, string?][] = [
      [utc(2026, 10, 2, 9), -1299], [utc(2026, 10, 2, 17), -4550], [utc(2026, 10, 3, 8), 134521, salaire],
      [utc(2026, 10, 4, 14), -999, courses], [utc(2026, 10, 5, 6), -2105, courses],
    ];
    faits.forEach(([q, m, cat], i) => b.appeler("ecritures.ajouter", ecr(compte, m, q, `s${i}`, cat ? { categorieId: cat } : {})));
    const total = 100000 - 1299 - 4550 + 134521 - 999 - 2105;
    expect(b.appeler("soldes.aLaDate", { jour: "2026-10-05" })[compte]).toBe(total);
    expect(b.appeler("serie.parJour", { du: "2026-10-01", au: "2026-10-05" }).at(-1).soldeCents).toBe(total);
    expect(total).toBe(225568);
  });
});
