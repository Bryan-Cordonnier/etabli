// Plugins dont la version installée est révoquée (docs/20) : identifiant → raison. Rempli à chaque chargement de la liste
// des plugins, lu par les réglages pour traiter un plugin révoqué comme désactivé (module à part : pas de dépendance circulaire).
export const revoques = $state<Record<string, string>>({});

export function majRevoques(liste: { id: string; raison: string }[]): void {
  for (const id of Object.keys(revoques)) delete revoques[id];
  for (const { id, raison } of liste) revoques[id] = raison;
}
