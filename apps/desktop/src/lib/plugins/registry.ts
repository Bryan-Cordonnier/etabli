import type { MiniAppManifest, PluginManifest } from "$lib/types";

// Plugins officiels déclarés ici pour le jalon 1 (le contenu des mini-apps viendra ensuite).
// Au jalon 2, chaque plugin sera chargé depuis son propre manifest.json (cahier des charges, section 8.2).
export const PLUGINS: PluginManifest[] = [
  {
    id: "maths",
    name: "Maths et géométrie",
    description: "Trigonométrie, triangles, arcs et conversions",
    version: "0.1.0",
    color: "#7c5cfa",
    emoji: "📐",
    icon: "sigma",
    official: true,
    miniApps: [
      { id: "pythagore", name: "Pythagore", description: "Deux côtés connus, le troisième calculé", icon: "triangle-right", emoji: "📐", plannedFor: "v1" },
      { id: "triangle", name: "Résolution de triangle", description: "Côtés, angles, aire", icon: "triangle", emoji: "🔺", plannedFor: "v1" },
      { id: "arc", name: "Arc et cercle", description: "Corde, flèche, rayon, longueur d'arc", icon: "spline", emoji: "⭕", plannedFor: "v1" },
      { id: "conversions", name: "Conversions", description: "mm ↔ pouces, degrés ↔ pente %", icon: "arrows", emoji: "🔁", plannedFor: "v1" },
    ],
  },
  {
    id: "economie",
    name: "Économie de matière",
    description: "Optimiser les débits de barres et le calepinage de tôles",
    version: "0.1.0",
    color: "#16a34a",
    emoji: "♻️",
    icon: "layers",
    official: true,
    miniApps: [
      { id: "debit-tubes", name: "Débit de tubes", description: "Le moins de barres possible", icon: "cylinder", emoji: "📏", plannedFor: "v1" },
      { id: "calepinage-rect", name: "Calepinage rectangles", description: "Platines et flans sur tôle", icon: "grid", emoji: "🟩", plannedFor: "v1" },
      { id: "calepinage-dxf", name: "Calepinage DXF", description: "Formes libres importées de SolidWorks", icon: "shapes", emoji: "🧩", plannedFor: "v2" },
    ],
  },
  {
    id: "tolerie",
    name: "Tôlerie",
    description: "Pliage : développés et efforts",
    version: "0.1.0",
    color: "#ea7a1a",
    emoji: "🔨",
    icon: "hammer",
    official: true,
    miniApps: [
      { id: "developpe", name: "Développé de pliage", description: "Facteur K, lignes de pli", icon: "bend", emoji: "📃", plannedFor: "v1" },
      { id: "ve", name: "Vé et effort de pliage", description: "Ouverture conseillée, tonnage", icon: "vee", emoji: "🔻", plannedFor: "v1" },
    ],
  },
  {
    id: "materiaux",
    name: "Matériaux et fixation",
    description: "Masses, perçages, taraudages",
    version: "0.1.0",
    color: "#0e9fb7",
    emoji: "⚖️",
    icon: "weight",
    official: true,
    miniApps: [
      { id: "masse", name: "Masse d'un profilé", description: "Tube, tôle, rond plein…", icon: "weight", emoji: "⚖️", plannedFor: "v1" },
      { id: "taraudage", name: "Perçage avant taraudage", description: "Métrique, pas standard et fin", icon: "bolt", emoji: "🔩", plannedFor: "v1" },
      { id: "rotation", name: "Vitesse de rotation", description: "N = 1000·Vc / (π·D)", icon: "gauge", emoji: "⚙️", plannedFor: "v1" },
    ],
  },
  {
    id: "chaudronnerie",
    name: "Chaudronnerie",
    description: "Développés de traçage",
    version: "0.1.0",
    color: "#e0483e",
    emoji: "🔥",
    icon: "flame",
    official: true,
    miniApps: [
      { id: "cone", name: "Tronçon de cône", description: "Traçage et DXF 1:1", icon: "cone", emoji: "🔶", plannedFor: "v2" },
      { id: "piquage", name: "Piquage", description: "Cylindre sur cylindre", icon: "cylinder", emoji: "➕", plannedFor: "v2" },
    ],
  },
];

export interface MiniAppRef {
  plugin: PluginManifest;
  app: MiniAppManifest;
}

/** Identifiant global d'une mini-app, utilisé pour les favoris : « plugin/mini-app ». */
export const appKey = (pluginId: string, appId: string): string => `${pluginId}/${appId}`;

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.id === id);
}

export function getMiniApp(pluginId: string, appId: string): MiniAppRef | undefined {
  const plugin = getPlugin(pluginId);
  const app = plugin?.miniApps.find((a) => a.id === appId);
  return plugin && app ? { plugin, app } : undefined;
}

export function getMiniAppByKey(key: string): MiniAppRef | undefined {
  const [pluginId = "", appId = ""] = key.split("/");
  return getMiniApp(pluginId, appId);
}

export function allMiniApps(): MiniAppRef[] {
  return PLUGINS.flatMap((plugin) => plugin.miniApps.map((app) => ({ plugin, app })));
}
