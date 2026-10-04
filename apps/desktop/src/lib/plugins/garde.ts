// Garde de l'hôte (docs/19) : tout message d'une mini-app est contrôlé ici avant que le moteur n'y touche. Une mini-app
// est un code qu'on ne maîtrise pas (un jour, celui d'un tiers) : on ne lui fait confiance ni sur la forme, ni sur la
// taille, ni sur ce qu'elle a le droit de demander.
import type { PluginToHost, SavedFile } from "@etabli/sdk/protocol";

export const LIMITES = {
  /** Taille JSON d'un document, de réglages, de données publiées ou envoyées. */
  donnees: 4 * 1024 * 1024,
  texte: 2000,
  presse: 1024 * 1024,
  fichier: 20 * 1024 * 1024,
  nomFichier: 120,
  hauteurMin: 160,
  hauteurMax: 20000,
  pagesFiche: 60,
  pageFiche: 600_000,
  cssFiche: 100_000,
  lignesCartouche: 40,
} as const;

/** Extensions qu'une mini-app peut proposer à « Enregistrer sous » : jamais un programme ni un script. */
export const EXTENSIONS_FICHIER: ReadonlySet<string> = new Set(["csv", "tsv", "dxf", "json", "txt", "svg", "md", "xml"]);

export interface Contexte {
  /** Permissions déclarées dans le manifeste (déjà filtrées sur les permissions connues). */
  permissions: readonly string[];
  /** Contrat strict (apiVersion ≥ 2) : sinon, les anciennes mini-apps gardent leurs droits d'avant. */
  strict: boolean;
  /** Noms de service que le manifeste déclare (`provides`). */
  provides: readonly string[];
}

export type Verdict = { ok: true; message: PluginToHost } | { ok: false; raison: string };

const refus = (raison: string): Verdict => ({ ok: false, raison });
const bon = (message: PluginToHost): Verdict => ({ ok: true, message });

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estTexte = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Taille JSON, ou `null` si la valeur n'est pas sérialisable (référence circulaire, BigInt…). */
function tailleJson(valeur: unknown): number | null {
  try {
    return JSON.stringify(valeur ?? null).length;
  } catch {
    return null;
  }
}

function donneesValides(valeur: unknown): boolean {
  const t = tailleJson(valeur);
  return t !== null && t <= LIMITES.donnees;
}

/** Nom de fichier proposé : ni chemin, ni caractère interdit sous Windows, ni nom réservé ou caché. */
export function nomFichierSur(nom: unknown): string | null {
  if (typeof nom !== "string") return null;
  const propre = nom.trim();
  if (propre.length === 0 || propre.length > LIMITES.nomFichier) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(propre)) return null;
  if (propre.startsWith(".") || propre.endsWith(".") || propre.endsWith(" ")) return null;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(propre)) return null;
  return propre;
}

function fichierValide(f: unknown): f is SavedFile {
  if (!estObjet(f)) return false;
  const nom = nomFichierSur(f.name);
  if (!nom) return false;
  if (typeof f.extension !== "string" || !EXTENSIONS_FICHIER.has(f.extension.toLowerCase())) return false;
  if (!nom.toLowerCase().endsWith(`.${f.extension.toLowerCase()}`)) return false;
  if (typeof f.content !== "string" || f.content.length > LIMITES.fichier) return false;
  return estTexte(f.description, 80);
}

function ficheValide(f: unknown): boolean {
  if (!estObjet(f)) return false;
  if (!estTexte(f.kind, 120) || !estTexte(f.title, 200) || !estTexte(f.subtitle, 300)) return false;
  if (f.css !== undefined && !estTexte(f.css, LIMITES.cssFiche)) return false;
  if (!Array.isArray(f.pages) || f.pages.length > LIMITES.pagesFiche) return false;
  if (!f.pages.every((p) => estTexte(p, LIMITES.pageFiche))) return false;
  if (!Array.isArray(f.ident) || f.ident.length > LIMITES.lignesCartouche) return false;
  return f.ident.every((l) => Array.isArray(l) && l.length === 2 && estTexte(l[0], 120) && estTexte(l[1], 300));
}

/** Permission nécessaire à un type de message ; `null` : message toujours permis. */
const PERMISSION_REQUISE: Record<string, string | null> = {
  update: null,
  title: null,
  summary: null,
  notify: null,
  height: null,
  ready: null,
  shortcut: null,
  pluginData: null,
  provide: null,
  copy: "presse-papiers",
  print: "impression",
  saveFile: "fichiers",
  send: "envoi",
  openSettings: "reglages",
  addMachine: "reglages",
};

/**
 * Contrôle un message brut reçu d'une mini-app. Renvoie le message à traiter (éventuellement corrigé, par exemple la
 * hauteur ramenée dans ses bornes) ou la raison du refus. Ne jette jamais d'exception.
 */
export function controler(brut: unknown, ctx: Contexte): Verdict {
  try {
    if (!estObjet(brut) || typeof brut.type !== "string") return refus("message mal formé");
    const type = brut.type;
    if (!Object.prototype.hasOwnProperty.call(PERMISSION_REQUISE, type)) return refus(`type inconnu : ${type.slice(0, 40)}`);

    const requise = PERMISSION_REQUISE[type];
    if (requise && ctx.strict && !ctx.permissions.includes(requise)) return refus(`permission « ${requise} » non déclarée`);

    switch (type) {
      case "update":
      case "pluginData":
        return donneesValides(brut.data) ? bon({ type, data: brut.data } as PluginToHost) : refus("données trop volumineuses ou illisibles");
      case "title":
        return estTexte(brut.title, 300) ? bon({ type, title: brut.title }) : refus("titre invalide");
      case "summary":
        return estTexte(brut.summary, LIMITES.texte) ? bon({ type, summary: brut.summary }) : refus("résumé invalide");
      case "notify":
        return estTexte(brut.text, LIMITES.texte) ? bon({ type, text: brut.text }) : refus("texte invalide");
      case "copy":
        return estTexte(brut.text, LIMITES.presse) ? bon({ type, text: brut.text }) : refus("texte trop long");
      case "height": {
        const v = brut.value;
        if (typeof v !== "number" || !Number.isFinite(v)) return refus("hauteur invalide");
        return bon({ type, value: Math.min(LIMITES.hauteurMax, Math.max(LIMITES.hauteurMin, v)) });
      }
      case "ready":
        return bon({ type });
      case "shortcut":
        if (!estTexte(brut.key, 40) || (brut.code !== undefined && !estTexte(brut.code, 40))) return refus("raccourci invalide");
        return bon({
          type,
          key: brut.key,
          ...(brut.code !== undefined ? { code: brut.code as string } : {}),
          ctrl: brut.ctrl === true,
          shift: brut.shift === true,
          alt: brut.alt === true,
        });
      case "print":
        return ficheValide(brut.fiche) ? bon({ type, fiche: brut.fiche as never }) : refus("fiche invalide");
      case "provide":
        if (!estTexte(brut.name, 64) || !/^[a-z0-9-]+$/.test(brut.name)) return refus("nom de service invalide");
        if (!ctx.provides.includes(brut.name)) return refus("service non déclaré dans le manifeste");
        return donneesValides(brut.data) ? bon({ type, name: brut.name, data: brut.data }) : refus("données trop volumineuses ou illisibles");
      case "openSettings":
        if (!estTexte(brut.plugin, 64) || !/^[a-z0-9-]+$/.test(brut.plugin)) return refus("plugin invalide");
        if (brut.hash !== undefined && !estTexte(brut.hash, 200)) return refus("ancre invalide");
        return bon({ type, plugin: brut.plugin, ...(brut.hash !== undefined ? { hash: brut.hash as string } : {}) });
      case "addMachine":
        return estTexte(brut.kind, 40) ? bon({ type, kind: brut.kind as never }) : refus("type de machine invalide");
      case "send":
        if (!estTexte(brut.kind, 64) || !/^[a-z0-9-]+$/.test(brut.kind)) return refus("type d'envoi invalide");
        return donneesValides(brut.data) ? bon({ type, kind: brut.kind, data: brut.data }) : refus("données trop volumineuses ou illisibles");
      case "saveFile":
        return fichierValide(brut.file)
          ? bon({ type, file: { ...brut.file, name: nomFichierSur(brut.file.name)!, extension: brut.file.extension.toLowerCase() } })
          : refus("fichier refusé (nom, extension ou taille)");
      default:
        return refus("type inconnu");
    }
  } catch {
    return refus("message illisible");
  }
}
