import { mount } from "svelte";
// Polices intégrées à l'application : elles fonctionnent hors ligne.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./app.css";
import { reportErrors } from "./lib/errors";
import { api, system } from "./lib/api";
import { distribution } from "./lib/distribution";
import { decider } from "./lib/porte";
import { initStorage } from "./lib/storage";

reportErrors();
document.title = distribution.name;

// Version web construite (seule ou avec un serveur) : le service worker garde l'application pour l'utiliser hors ligne.
if (api.id !== "tauri" && import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((err) => console.error("Mode hors ligne indisponible :", err));
}

const target = document.getElementById("app");
if (!target) throw new Error("Élément #app introuvable dans index.html");

// Serveur Établi : connexion d'abord si la session manque ou a expiré (l'application ne démarre pas sans compte).
const porte = await decider();
let racine: Record<string, unknown>;
if (porte) {
  const { default: Connexion } = await import("./lib/components/Connexion.svelte");
  racine = mount(Connexion, { target, props: porte });
} else {
  // Réglages et plugins d'abord : les onglets et les paramètres en ont besoin dès leur création.
  await initStorage();
  // Pas d'adresse de mises à jour dans la configuration (distribution sans publications) : on n'en cherche pas.
  if (api.id === "tauri" && api.capacites.miseAJour) api.capacites.miseAJour = (await system.appInfo()).miseAJour;
  // Les modules qui lisent les réglages sont importés seulement maintenant : ils attendent le fichier de réglages.
  const { loadPlugins } = await import("./lib/plugins/registry.svelte");
  await loadPlugins();
  const { services } = await import("./lib/state/services.svelte");
  await services.load();
  const { default: App } = await import("./App.svelte");
  racine = mount(App, { target });
}

export default racine;
