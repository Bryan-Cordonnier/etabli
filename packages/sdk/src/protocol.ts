// Messages échangés entre le moteur et une mini-app (cahier des charges, section 8.5).
// La mini-app tourne dans un cadre isolé ; le moteur lui transmet un MessagePort privé,
// et tout passe ensuite par ce port.

/** Incrémenté à chaque changement incompatible du protocole. */
export const PROTOCOL_VERSION = 1;

/** Premier message, envoyé par le moteur avec le port de communication. */
export const CONNECT = "etabli:connect";

/** Variables de couleur du thème (mêmes noms que les variables CSS : `--surface`, `--accent`…). */
export type ThemeTokens = Record<string, string>;

export type ColorScheme = "light" | "dark";

export interface DocumentSnapshot<T = unknown> {
  /** `null` tant que le document n'a pas été enregistré (aucune modification encore). */
  id: string | null;
  title: string;
  data: T | null;
}

/** Matière vendue par un fournisseur : barres par type de profilé, ou tôles. */
export type StockKind =
  | "tube-rond"
  | "tube-carre"
  | "tube-rect"
  | "rond-plein"
  | "carre-plein"
  | "plat"
  | "corniere"
  | "poutrelle"
  | "autre"
  | "tole";

export const STOCK_KINDS: { id: StockKind; label: string }[] = [
  { id: "tube-rond", label: "Tube rond" },
  { id: "tube-carre", label: "Tube carré" },
  { id: "tube-rect", label: "Tube rectangulaire" },
  { id: "rond-plein", label: "Rond plein" },
  { id: "carre-plein", label: "Carré plein" },
  { id: "plat", label: "Plat" },
  { id: "corniere", label: "Cornière" },
  { id: "poutrelle", label: "IPE, HEA, UPN" },
  { id: "autre", label: "Autre profilé" },
  { id: "tole", label: "Tôle" },
];

export interface SupplierItem {
  id: string;
  kind: StockKind;
  /** Matière (« Acier S235 », « Inox 304 »…) ; vide : toutes. */
  material: string;
  /** Profilé ou épaisseur précis (« 40 × 40 × 2 », « 2 mm ») ; vide : tous. */
  designation: string;
  /** Longueur de barre, ou longueur de tôle, en mm. */
  length: number;
  /** Largeur de tôle en mm ; `null` pour une barre. */
  width: number | null;
  /** Tolérance sur la longueur (et la largeur d'une tôle), en mm, positives toutes les deux. */
  tolMinus: number;
  tolPlus: number;
  /** Prix facultatif, pour le chiffrage : Économie de matière ne s'en sert jamais. */
  price: number | null;
  priceUnit: "piece" | "kg" | "m" | "m2";
}

export interface Supplier {
  id: string;
  name: string;
  items: SupplierItem[];
}

export type SawType = "ruban" | "tronconneuse" | "onglet" | "autre";

export const SAW_TYPES: { id: SawType; label: string }[] = [
  { id: "ruban", label: "Scie à ruban" },
  { id: "tronconneuse", label: "Tronçonneuse" },
  { id: "onglet", label: "Scie à onglet" },
  { id: "autre", label: "Autre scie" },
];

/** Scie de débit (tubes, profilés). Dimensions en mm, angles en degrés. */
export interface Saw {
  id: string;
  kind: "scie";
  name: string;
  type: SawType;
  /** Épaisseur de lame (trait de scie). */
  kerf: number;
  /** Angle maxi de la scie (0 : coupes droites seulement). */
  maxAngle: number;
  /** La scie tourne des deux côtés (−45° à +45°), sinon d'un seul. */
  bothSides: boolean;
  /** Course maxi de la butée de longueur ; `null` : pas de butée. */
  stopMax: number | null;
  /** Longueur la plus courte que l'étau tient encore. */
  minLength: number;
  /** Dressage du bout de barre avant la première coupe. */
  trim: number;
}

/** Cisaille guillotine (calepinage de tôles). Dimensions en mm. */
export interface Shear {
  id: string;
  kind: "cisaille";
  name: string;
  /** Longueur de coupe maxi (longueur de lame). */
  bladeLength: number;
  /** Épaisseur maxi en acier. */
  maxThickness: number;
  /** Course de la butée arrière. */
  gaugeMax: number;
  /** Dressage du premier bord de la tôle. */
  trim: number;
}

export type Machine = Saw | Shear;
export type MachineKind = Machine["kind"];

/** Bibliothèques de l'application, lisibles par tous les plugins (cahier des charges, section 3.3). */
export interface Libraries {
  suppliers: Supplier[];
  /** Machines de l'atelier : scies, cisailles (la presse plieuse viendra avec la Tôlerie). */
  machines: Machine[];
}

/**
 * Fiche d'atelier à imprimer (cahier des charges, section 3.2). Le moteur ajoute l'en-tête
 * (titre, cartouche avec la date et l'auteur) et le pied de page numéroté ; le plugin fournit les pages.
 */
export interface FichePrint {
  /** « Fiche de coupe », « Fiche de calepinage »… */
  kind: string;
  /** Vide : le moteur met le titre du calcul (celui que l'utilisateur a pu renommer). */
  title: string;
  subtitle: string;
  /** Lignes du cartouche en plus de la date et de l'auteur : `[["Poste", "Scie à ruban"]]`. */
  ident: [string, string][];
  /** Une page A4 par élément, en HTML (sans script), avec les classes de la feuille commune des fiches. */
  pages: string[];
  /** Styles propres au plugin, ajoutés après la feuille commune. */
  css?: string;
}

export type HostToPlugin =
  | {
      type: "init";
      protocol: number;
      pluginId: string;
      appId: string;
      document: DocumentSnapshot;
      theme: ThemeTokens;
      colorScheme: ColorScheme;
      libraries: Libraries;
      /** Réglages du plugin, partagés par toutes ses mini-apps ; `null` s'il n'en a pas encore. */
      pluginData: unknown;
      /** Données envoyées par une autre mini-app (« Envoyer au calepinage »), ou `null`. */
      incoming: Incoming | null;
    }
  | { type: "theme"; theme: ThemeTokens; colorScheme: ColorScheme }
  | { type: "libraries"; libraries: Libraries }
  | { type: "pluginData"; data: unknown };

export type PluginToHost =
  | { type: "update"; data: unknown }
  | { type: "title"; title: string }
  | { type: "summary"; summary: string }
  | { type: "notify"; text: string }
  | { type: "copy"; text: string }
  | { type: "height"; value: number }
  | { type: "shortcut"; key: string; ctrl: boolean; shift: boolean; alt: boolean }
  | { type: "pluginData"; data: unknown }
  | { type: "print"; fiche: FichePrint }
  | { type: "addMachine"; kind: MachineKind }
  | { type: "send"; kind: string; data: unknown };

/**
 * Envoi d'une mini-app vers une autre (cahier des charges des plugins, section 3) : le moteur
 * ouvre, dans un nouvel onglet, une mini-app qui déclare accepter ce type dans son manifeste
 * (`"accepts": ["piece-plate"]`), et lui transmet les données à son ouverture.
 *
 * Types connus :
 * - `piece-plate` : une pièce plate rectangulaire `{ name, length, width, quantity, grain, thickness?, family? }`
 *   (longueur le long du sens de laminage si `grain`).
 */
export interface Incoming {
  kind: string;
  data: unknown;
  /** Nom de la mini-app qui a envoyé les données. */
  from: string;
}

/** Raccourcis gérés par le moteur même quand le clavier est dans une mini-app. */
export function isHostShortcut(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  const key = e.key.toLowerCase();
  if (e.altKey && e.key === "ArrowLeft") return true;
  if (!e.ctrlKey) return false;
  return ["t", "w", "k", "b", "tab"].includes(key) || /^[1-9]$/.test(key);
}
