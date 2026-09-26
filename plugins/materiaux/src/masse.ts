// Masse d'une pièce ou d'un profilé (cahier des charges des plugins, section 5.1).
// Dimensions en mm, masses volumiques en kg/dm³, masses en kg.
import matieresTable from "./data/matieres.json";
import profilesTable from "./data/profiles.json";

export interface Matiere {
  id: string;
  nom: string;
  /** Masse volumique en kg/dm³. */
  masseVolumique: number;
}

export const MATIERES: Matiere[] = matieresTable.matieres;
export const SOURCE_MATIERES: string = matieresTable.source;
export const matiere = (id: string): Matiere => MATIERES.find((m) => m.id === id) ?? MATIERES[0]!;

/** Masse volumique de l'acier, celle des masses au mètre des profilés laminés. */
export const ACIER = 7.85;

export type Forme = "plat" | "tube-rond" | "tube-rect" | "rond" | "carre" | "corniere" | "profile";

export const FORMES: { id: Forme; label: string }[] = [
  { id: "plat", label: "Tôle ou plat" },
  { id: "tube-rond", label: "Tube rond" },
  { id: "tube-rect", label: "Tube carré ou rectangulaire" },
  { id: "rond", label: "Rond plein" },
  { id: "carre", label: "Carré plein" },
  { id: "corniere", label: "Cornière" },
  { id: "profile", label: "IPE, HEA, HEB, UPN" },
];

export type Famille = keyof typeof profilesTable.profiles;
export const FAMILLES = Object.keys(profilesTable.profiles) as Famille[];
export const SOURCE_PROFILES: string = profilesTable.source;

/** Hauteurs disponibles d'une famille de profilés, de la plus petite à la plus grande. */
export const tailles = (famille: Famille): string[] =>
  Object.keys(profilesTable.profiles[famille]).sort((a, b) => Number(a) - Number(b));

/** Masse au mètre d'un profilé laminé en acier, lue dans la table (NaN s'il n'y est pas). */
export function profileKgPerM(famille: Famille, taille: string): number {
  const table: Record<string, number> = profilesTable.profiles[famille];
  return table[taille] ?? NaN;
}

export interface Cotes {
  /** Largeur, diamètre ou côté. */
  a: number;
  /** Seconde largeur (tube rectangulaire, cornière). */
  b: number;
  /** Épaisseur. */
  e: number;
}

export interface Section {
  /** Aire de la section en mm². */
  aire: number;
  /** Périmètre extérieur en mm : la surface à peindre par mm de longueur. */
  perimetre: number;
}

/**
 * Section et périmètre extérieur d'une forme simple, angles vifs (les tubes formés à froid ont des
 * angles arrondis : leur section réelle est un peu plus faible). Renvoie un message si une cote manque.
 */
export function section(forme: Exclude<Forme, "profile">, { a, b, e }: Cotes): Section | string {
  const positive = (...v: number[]) => v.every((x) => x > 0 && Number.isFinite(x));
  switch (forme) {
    case "plat":
      if (!positive(a, e)) return "Renseignez la largeur et l'épaisseur.";
      return { aire: a * e, perimetre: 2 * (a + e) };
    case "tube-rond":
      if (!positive(a, e)) return "Renseignez le diamètre extérieur et l'épaisseur.";
      if (e >= a / 2) return "L'épaisseur doit rester sous la moitié du diamètre (sinon, c'est un rond plein).";
      return { aire: Math.PI * e * (a - e), perimetre: Math.PI * a };
    case "tube-rect":
      if (!positive(a, b, e)) return "Renseignez les deux côtés et l'épaisseur.";
      if (e >= Math.min(a, b) / 2) return "L'épaisseur doit rester sous la moitié du plus petit côté.";
      return { aire: 2 * e * (a + b - 2 * e), perimetre: 2 * (a + b) };
    case "rond":
      if (!positive(a)) return "Renseignez le diamètre.";
      return { aire: (Math.PI * a * a) / 4, perimetre: Math.PI * a };
    case "carre":
      if (!positive(a)) return "Renseignez le côté.";
      return { aire: a * a, perimetre: 4 * a };
    case "corniere":
      if (!positive(a, b, e)) return "Renseignez les deux ailes et l'épaisseur.";
      if (e >= Math.min(a, b)) return "L'épaisseur doit rester sous la largeur des ailes.";
      return { aire: e * (a + b - e), perimetre: 2 * (a + b) };
  }
}

/** Masse au mètre (kg/m) d'une section de `aire` mm² : 1 mm² sur 1 m fait 1 cm³. */
export const kgPerM = (aire: number, masseVolumique: number): number => (aire * masseVolumique) / 1000;

/** Aire (mm²) d'un profilé connu par sa masse au mètre. */
export const aireFromKgPerM = (kgm: number, masseVolumique: number): number => (kgm * 1000) / masseVolumique;

export interface Pesee {
  kgPerM: number;
  /** Masse d'une pièce. */
  unitaire: number;
  total: number;
  /** Surface extérieure d'une pièce en m², extrémités non comprises (NaN si inconnue). */
  surface: number;
}

/** Masse d'une pièce de `longueur` mm et de toute la série. */
export function pesee(kgm: number, perimetre: number, longueur: number, quantite: number): Pesee {
  const unitaire = (kgm * longueur) / 1000;
  return { kgPerM: kgm, unitaire, total: unitaire * quantite, surface: (perimetre * longueur) / 1e6 };
}
