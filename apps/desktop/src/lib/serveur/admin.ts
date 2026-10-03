// Appels d'administration et de compte du serveur (docs/17), réservés à l'interface « Paramètres ».
import type { ClientApi } from "./http";

export interface UtilisateurServeur {
  id: string;
  nom: string;
  role: "admin" | "utilisateur";
  actif: boolean;
  cree: number;
  derniereConnexion: number | null;
}

export interface PluginServeur {
  id: string;
  version: string;
  actifGlobal: boolean;
  installe: number;
  utilisateurs: string[];
  manifest: { name?: string } | null;
}

export interface LigneJournal {
  id: number;
  horodatage: number;
  acteur: string | null;
  action: string;
  cible: string | null;
  detail: string | null;
}

export const admin = (client: ClientApi) => ({
  utilisateurs: () => client.requete<UtilisateurServeur[]>("GET", "/api/admin/utilisateurs"),
  creerUtilisateur: (nom: string, motDePasse: string) =>
    client.requete<UtilisateurServeur>("POST", "/api/admin/utilisateurs", { nom, motDePasse }),
  modifierUtilisateur: (id: string, changement: { actif?: boolean; motDePasse?: string }) =>
    client.requete<void>("PATCH", `/api/admin/utilisateurs/${encodeURIComponent(id)}`, changement),
  supprimerUtilisateur: (id: string, nom: string) =>
    client.requete<void>("DELETE", `/api/admin/utilisateurs/${encodeURIComponent(id)}?confirmer=${encodeURIComponent(nom)}`),

  plugins: () => client.requete<PluginServeur[]>("GET", "/api/admin/plugins"),
  installerPlugin: (paquet: Uint8Array) => client.requete<{ id: string; version: string }>("POST", "/api/admin/plugins", paquet),
  modifierPlugin: (id: string, changement: { actifGlobal?: boolean; utilisateurs?: string[] }) =>
    client.requete<void>("PATCH", `/api/admin/plugins/${encodeURIComponent(id)}`, changement),
  supprimerPlugin: (id: string) => client.requete<void>("DELETE", `/api/admin/plugins/${encodeURIComponent(id)}`),

  journal: (limite = 100) => client.requete<LigneJournal[]>("GET", `/api/admin/journal?limite=${limite}`),
  exporterBase: () => client.fichier("GET", "/api/admin/export"),
});

export const compte = (client: ClientApi) => ({
  changerMotDePasse: (actuel: string, nouveau: string) =>
    client.requete<void>("POST", "/api/moi/mot-de-passe", { actuel, nouveau }),
  deconnecter: () => client.requete<void>("DELETE", "/api/session"),
  exporter: () => client.requete<unknown>("GET", "/api/moi/export"),
});
