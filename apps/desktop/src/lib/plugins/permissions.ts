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
];

export const PERMISSION_IDS: ReadonlySet<string> = new Set(PERMISSIONS.map((p) => p.id));

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
  return [...new Set(liste.filter((p) => PERMISSION_IDS.has(p)))];
}

/** Libellés lisibles des permissions d'un plugin, pour l'écran d'installation. */
export function libelles(liste: readonly string[]): string[] {
  const set = new Set(connues(liste));
  return PERMISSIONS.filter((p) => set.has(p.id)).map((p) => p.label);
}
