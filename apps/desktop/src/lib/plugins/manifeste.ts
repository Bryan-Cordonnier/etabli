// Lecture défensive des champs « appels entre plugins » d'un manifeste (docs/24, A.1.2). Fonctions pures, sans Svelte : le
// manifeste vient d'un plugin, donc de quelqu'un qui n'est pas de confiance.
import { ICONS, type IconName } from "../icons";
import type { AppManifest, PageManifest, ParameterManifest, ParameterValue, WidgetManifest, WidgetSize } from "../types";
import { NOM_FONCTION } from "./garde";

/** Service → fonction → niveau d'accès. */
export type FonctionsOffertes = Record<string, Record<string, "lecture" | "ecriture">>;

/** Chemin relatif sûr (« service/index.html »), ou null : jamais absolu, jamais de « .. ». */
export function cheminRelatif(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value.length > 200) return null;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "")) return null;
  return value;
}

/**
 * Fonctions offertes, ne gardant que celles d'un service déclaré dans `provides`, à nom valide et à accès connu.
 * Objets sans prototype : un nom comme « constructor » ne retombe jamais sur `Object.prototype`.
 */
export function fonctionsDe(value: unknown, provides: Record<string, string>): FonctionsOffertes {
  const sortie: FonctionsOffertes = Object.create(null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return sortie;
  for (const [service, fonctions] of Object.entries(value)) {
    if (!Object.hasOwn(provides, service) || typeof fonctions !== "object" || fonctions === null || Array.isArray(fonctions)) continue;
    const liste: Record<string, "lecture" | "ecriture"> = Object.create(null);
    for (const [nom, def] of Object.entries(fonctions)) {
      const acces = (def as { acces?: unknown } | null)?.acces;
      if (NOM_FONCTION.test(nom) && (acces === "lecture" || acces === "ecriture")) liste[nom] = acces;
    }
    sortie[service] = liste;
  }
  return sortie;
}

// ——— Pages, apps et paramètres (contrat 3, docs/28) ———

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID_PARAMETRE = /^[a-z][A-Za-z0-9]{0,31}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PARAMETRES = 60;

const texte = (v: unknown, repli = "", max = 200): string => (typeof v === "string" ? v.slice(0, max) : repli);
const objet = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const icone = (v: unknown): IconName => (typeof v === "string" && v in ICONS ? (v as IconName) : "puzzle");

/** Apps déclarées (`apps`) : identifiant unique, page d'entrée à chemin relatif sûr. Les autres sont ignorées. */
export function appsDe(value: unknown): AppManifest[] {
  if (!Array.isArray(value)) return [];
  const vus = new Set<string>();
  const sortie: AppManifest[] = [];
  for (const brut of value) {
    const a = objet(brut);
    const id = texte(a?.id, "", 64);
    const entry = cheminRelatif(a?.entry);
    if (!a || !ID.test(id) || vus.has(id) || !entry) continue;
    vus.add(id);
    sortie.push({
      id,
      name: texte(a.name, id, 80),
      entry,
      accepts: Array.isArray(a.accepts) ? a.accepts.filter((k): k is string => typeof k === "string").slice(0, 20) : [],
    });
  }
  return sortie;
}

/** Pages déclarées (`pages`) : seule la disposition `{ type: "app", app }` existe, vers une app qui existe. */
export function pagesDe(value: unknown, apps: readonly AppManifest[]): PageManifest[] {
  if (!Array.isArray(value)) return [];
  const vus = new Set<string>();
  const sortie: PageManifest[] = [];
  for (const brut of value) {
    const p = objet(brut);
    const id = texte(p?.id, "", 64);
    const disposition = objet(p?.layout);
    const app = texte(disposition?.app, "", 64);
    if (!p || !ID.test(id) || vus.has(id) || disposition?.type !== "app" || !apps.some((a) => a.id === app)) continue;
    vus.add(id);
    sortie.push({ id, title: texte(p.title, id, 80), icon: icone(p.icon), app, category: texte(p.category, "", 40).trim() });
  }
  return sortie;
}

const TAILLE = /^[1-4]x[1-4]$/;
export const estTaille = (v: unknown): v is WidgetSize => typeof v === "string" && TAILLE.test(v);

/** Widgets déclarés (`widgets`) : une app qui existe, au moins une taille valide (les autres sont ignorées). */
export function widgetsDe(value: unknown, apps: readonly AppManifest[]): WidgetManifest[] {
  if (!Array.isArray(value)) return [];
  const vus = new Set<string>();
  const sortie: WidgetManifest[] = [];
  for (const brut of value.slice(0, 20)) {
    const w = objet(brut);
    const id = texte(w?.id, "", 64);
    const app = texte(w?.app, "", 64);
    if (!w || !ID.test(id) || vus.has(id) || !apps.some((a) => a.id === app)) continue;
    const sizes = [...new Set((Array.isArray(w.sizes) ? w.sizes : []).filter(estTaille))].slice(0, 8);
    if (sizes.length === 0) continue;
    vus.add(id);
    sortie.push({ id, title: texte(w.title, id, 80), icon: icone(w.icon), app, sizes, default: estTaille(w.default) && sizes.includes(w.default) ? w.default : sizes[0]! });
  }
  return sortie;
}

/** Paramètres déclarés (`parameters`) : types connus, valeur par défaut cohérente ; ce qui est illisible est ignoré. */
export function parametresDe(value: unknown): ParameterManifest[] {
  if (!Array.isArray(value)) return [];
  const vus = new Set<string>();
  const sortie: ParameterManifest[] = [];
  for (const brut of value.slice(0, MAX_PARAMETRES)) {
    const p = objet(brut);
    const id = texte(p?.id, "", 32);
    if (!p || !ID_PARAMETRE.test(id) || vus.has(id)) continue;
    const base = { id, label: texte(p.label, id, 80), group: texte(p.group, "", 40), hint: texte(p.hint, "", 160) };
    let def: ParameterManifest | null = null;
    switch (p.type) {
      case "number": {
        const fini = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
        const min = fini(p.min);
        const max = fini(p.max);
        const pas = fini(p.step);
        def = { ...base, type: "number", default: fini(p.default) ?? 0, unit: texte(p.unit, "", 12), min, max, step: pas !== null && pas > 0 ? pas : 1 };
        break;
      }
      case "text":
        def = { ...base, type: "text", default: texte(p.default) };
        break;
      case "boolean":
        def = { ...base, type: "boolean", default: p.default === true };
        break;
      case "time":
        def = { ...base, type: "time", default: typeof p.default === "string" && HEURE.test(p.default) ? p.default : "00:00" };
        break;
      case "select": {
        const options = (Array.isArray(p.options) ? p.options : [])
          .map((o) => ({ value: texte(objet(o)?.value, "", 64), label: texte(objet(o)?.label, "", 80) }))
          .filter((o, i, liste) => o.value !== "" && liste.findIndex((x) => x.value === o.value) === i)
          .slice(0, 30);
        if (options.length === 0) break;
        const valeur = typeof p.default === "string" && options.some((o) => o.value === p.default) ? p.default : options[0]!.value;
        def = { ...base, type: "select", default: valeur, options };
        break;
      }
    }
    if (!def) continue;
    vus.add(id);
    sortie.push(def);
  }
  return sortie;
}

/** Valeur acceptable pour ce paramètre : celle qu'on donne si elle convient (bornes comprises), sinon la valeur par défaut. */
export function valeurValide(def: ParameterManifest, v: unknown): ParameterValue {
  switch (def.type) {
    case "number":
      return typeof v === "number" && Number.isFinite(v) && (def.min === null || v >= def.min) && (def.max === null || v <= def.max) ? v : def.default;
    case "text":
      return typeof v === "string" ? v.slice(0, 200) : def.default;
    case "boolean":
      return typeof v === "boolean" ? v : def.default;
    case "time":
      return typeof v === "string" && HEURE.test(v) ? v : def.default;
    case "select":
      return typeof v === "string" && def.options.some((o) => o.value === v) ? v : def.default;
  }
}

/** Les valeurs de tous les paramètres déclarés : enregistrées si elles conviennent, sinon par défaut. */
export function valeursDe(defs: readonly ParameterManifest[], enregistrees: unknown): Record<string, ParameterValue> {
  const source = objet(enregistrees) ?? {};
  const sortie: Record<string, ParameterValue> = Object.create(null);
  for (const def of defs) sortie[def.id] = valeurValide(def, Object.hasOwn(source, def.id) ? source[def.id] : undefined);
  return sortie;
}

/** Pourquoi un manifeste est refusé (contrat 3 exigé, `pages` explicite), ou null s'il est acceptable. */
export function raisonDeRefus(m: Record<string, unknown>, majeureApi: number): string | null {
  if (majeureApi < 3) return `Contrat « ${texte(m.apiVersion, "?", 20)} » : ce plugin doit être mis à jour pour le contrat ^3 (il doit déclarer ses pages).`;
  if (!Array.isArray(m.pages)) return "Le manifeste ne déclare pas « pages » (une liste, vide `[]` pour un plugin qui n'offre qu'un service).";
  if (!Array.isArray(m.apps)) return "Le manifeste ne déclare pas « apps » (une liste, vide `[]` s'il n'y a pas d'interface).";
  return null;
}