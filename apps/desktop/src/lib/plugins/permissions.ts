// Permissions des plugins (docs/19). Un plugin déclare dans son manifeste ce dont il a besoin ; le moteur refuse tout
// le reste. Un plugin de contrat `apiVersion` « ^2 » est contrôlé strictement ; un plugin « ^1 » (ancien) garde ses
// droits d'avant, signalés à l'utilisateur.

export interface PermissionInfo {
  id: string;
  /** Phrase affichée à l'utilisateur avant l'installation. */
  label: string;
}

export const PERMISSIONS: PermissionInfo[] = [
  { id: "fichiers", label: "Enregistrer des fichiers (CSV, DXF…) à l'endroit que vous choisissez" },
  { id: "impression", label: "Imprimer des fiches d'atelier" },
  { id: "presse-papiers", label: "Copier du texte dans le presse-papiers" },
  { id: "envoi", label: "Envoyer des données à une autre mini-app" },
  { id: "reglages", label: "Ouvrir les réglages d'un autre plugin" },
  { id: "notifications", label: "Programmer des rappels (notifications) sur le téléphone" },
];

export const PERMISSION_IDS: ReadonlySet<string> = new Set(PERMISSIONS.map((p) => p.id));

/**
 * Permission d'appel entre plugins : `appelle:<service>:<lecture|ecriture>` (docs/24, A.1.2). Une par service et par
 * niveau, montrée à l'installation. `ecriture` ne donne pas `lecture` : un plugin qui fait les deux déclare les deux.
 */
const APPEL = /^appelle:([a-z0-9][a-z0-9-]{0,63}):(lecture|ecriture)$/;

export function permissionAppel(permission: string): { service: string; acces: "lecture" | "ecriture" } | null {
  const m = APPEL.exec(permission);
  return m ? { service: m[1]!, acces: m[2] as "lecture" | "ecriture" } : null;
}

/** Version majeure d'un contrat (`^2`, `^2.1`, `>=2`, `2`) ; 1 si le texte est illisible ou absent. */
export function majeure(plage: string | undefined): number {
  const m = /(\d+)/.exec(plage ?? "");
  const n = m ? Number(m[1]) : 1;
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/** Vrai si le plugin est contrôlé strictement (contrat 2 et suivants). */
export const estStrict = (apiVersion: string | undefined): boolean => majeure(apiVersion) >= 2;

/** Permissions connues d'une liste de manifeste (les inconnues sont ignorées, sans effet). */
export function connues(liste: readonly string[]): string[] {
  return [...new Set(liste.filter((p) => typeof p === "string" && (PERMISSION_IDS.has(p) || APPEL.test(p))))];
}

/**
 * Libellés lisibles des permissions d'un plugin, pour l'écran d'installation. `nomDuFournisseur` donne, si on le sait, le
 * nom du plugin qui offre un service (« Agenda ») : la phrase devient « Ajouter des données dans le service « agenda »
 * du plugin Agenda ».
 */
export function libelles(liste: readonly string[], nomDuFournisseur?: (service: string) => string | undefined): string[] {
  const set = new Set(connues(liste));
  const fixes = PERMISSIONS.filter((p) => set.has(p.id)).map((p) => p.label);
  const appels = [...set]
    .map((p) => ({ p, a: permissionAppel(p) }))
    .filter((x): x is { p: string; a: NonNullable<ReturnType<typeof permissionAppel>> } => x.a !== null)
    .sort((x, y) => x.p.localeCompare(y.p))
    .map(({ a }) => {
      const nom = nomDuFournisseur?.(a.service);
      const cible = `le service « ${a.service} »${nom ? ` du plugin ${nom}` : " d'un autre plugin"}`;
      return a.acces === "ecriture" ? `Ajouter ou modifier des données dans ${cible}` : `Lire des données dans ${cible}`;
    });
  return [...fixes, ...appels];
}
