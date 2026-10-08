// Catégories de la colonne de gauche (docs/28, section 2) : logique pure. Une page appartient à une seule catégorie : celle que l'utilisateur
// lui a donnée, sinon celle que son plugin propose, sinon « Autres ». Les catégories se suivent dans l'ordre choisi, les nouvelles à la fin.

export const SANS_CATEGORIE = "Autres";

export interface PageClassee {
  key: string;
  /** Catégorie proposée par le plugin (« » : aucune). */
  category: string;
}

export interface Groupe<T> {
  name: string;
  items: T[];
}

/** Catégorie effective d'une page : le choix de l'utilisateur gagne. */
export const categorieDe = (p: PageClassee, choix: Readonly<Record<string, string>>): string => choix[p.key] || p.category || SANS_CATEGORIE;

/** Range les pages (déjà dans l'ordre voulu) par catégorie. Les catégories suivent `ordre`, puis leur première apparition. */
export function grouper<T extends PageClassee>(pages: readonly T[], choix: Readonly<Record<string, string>>, ordre: readonly string[]): Groupe<T>[] {
  const groupes = new Map<string, T[]>();
  for (const p of pages) {
    const nom = categorieDe(p, choix);
    const liste = groupes.get(nom);
    if (liste) liste.push(p);
    else groupes.set(nom, [p]);
  }
  const rang = (nom: string): number => {
    const i = ordre.indexOf(nom);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const noms = [...groupes.keys()];
  noms.sort((a, b) => rang(a) - rang(b) || noms.indexOf(a) - noms.indexOf(b));
  return noms.map((name) => ({ name, items: groupes.get(name)! }));
}

/** Ordre complet des catégories après avoir déplacé l'une d'elles d'un cran. */
export function deplacerCategorie(noms: readonly string[], nom: string, delta: -1 | 1): string[] {
  const liste = [...noms];
  const de = liste.indexOf(nom);
  const vers = de + delta;
  if (de < 0 || vers < 0 || vers >= liste.length) return liste;
  [liste[de], liste[vers]] = [liste[vers]!, liste[de]!];
  return liste;
}

/** Lecture défensive d'un « page → catégorie » enregistré. */
export function lireChoix(brut: unknown): Record<string, string> {
  const sortie: Record<string, string> = {};
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) return sortie;
  for (const [cle, valeur] of Object.entries(brut).slice(0, 500)) {
    if (typeof valeur === "string" && valeur.length <= 40 && cle.length <= 140) sortie[cle] = valeur;
  }
  return sortie;
}

export const lireNoms = (brut: unknown): string[] => (Array.isArray(brut) ? brut.filter((n): n is string => typeof n === "string" && n.length <= 40).slice(0, 100) : []);
