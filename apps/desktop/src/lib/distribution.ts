// Ce qui change d'une distribution à l'autre (Quotidien, ERP, Etablink…) : lu à la compilation dans le fichier désigné par
// ETABLE_DISTRIBUTION (voir vite.config.ts), sinon les valeurs d'Établi. Lecture défensive : un champ absent ou invalide garde sa valeur d'origine.
import { THEME_TOKENS, type Theme } from "./themeTokens";

export interface Distribution {
  /** Nom affiché dans la colonne de gauche. */
  name: string;
  /** Entrée « Plugins » dans la colonne et la palette de commandes ; faux : les plugins se gèrent dans Paramètres seulement. */
  pluginsPage: boolean;
  /** Thèmes fixes de la distribution (ni import, ni copie) ; `null` : les thèmes d'Établi, que l'utilisateur peut importer. */
  themes: Theme[] | null;
  /** Dessin du logo (contenu d'un SVG 24x24, trait `currentColor`), ou `null` : celui d'Établi. */
  logo: string | null;
}

export const DISTRIBUTION_DEFAUT: Distribution = { name: "Établi", pluginsPage: true, themes: null, logo: null };

const objet = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const COULEUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
/** Un logo ne contient que des formes SVG simples : aucun script, aucune image, aucun lien. */
const LOGO = /^(?:\s*<(?:path|circle|rect|line|polyline|polygon|ellipse)\b[^<>]*\/>\s*)+$/;

function lireTheme(brut: unknown): Theme | null {
  const t = objet(brut);
  const couleurs = objet(t?.colors);
  if (!t || !couleurs || typeof t.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(t.id) || typeof t.name !== "string" || t.name.trim() === "") return null;
  if (t.base !== "light" && t.base !== "dark") return null;
  const colors = {} as Theme["colors"];
  for (const jeton of THEME_TOKENS) {
    const v = couleurs[jeton];
    if (typeof v !== "string" || !COULEUR.test(v.trim())) return null;
    colors[jeton] = v.trim();
  }
  return { id: t.id, name: t.name.trim().slice(0, 40), author: typeof t.author === "string" ? t.author.slice(0, 60) : "", base: t.base, colors };
}

export function lireDistribution(brut: unknown): Distribution {
  const o = objet(brut);
  if (!o) return { ...DISTRIBUTION_DEFAUT };
  const themes = Array.isArray(o.themes) ? o.themes.map(lireTheme).filter((t): t is Theme => t !== null) : [];
  const ids = new Set(themes.map((t) => t.id));
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : DISTRIBUTION_DEFAUT.name,
    pluginsPage: o.pluginsPage !== false,
    // Au moins un thème clair ou sombre valable, sans doublon d'identifiant ; sinon les thèmes d'Établi.
    themes: themes.length > 0 && ids.size === themes.length ? themes : null,
    logo: typeof o.logo === "string" && o.logo.length <= 2000 && LOGO.test(o.logo) ? o.logo.trim() : null,
  };
}

declare const __DISTRIBUTION__: unknown;

export const distribution: Distribution = lireDistribution(typeof __DISTRIBUTION__ === "undefined" ? undefined : __DISTRIBUTION__);