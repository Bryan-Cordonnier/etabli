import { mount } from "svelte";
// Polices intégrées à l'application : elles fonctionnent hors ligne.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./app.css";
import { reportErrors } from "./lib/errors";
import { api } from "./lib/api";
import { initStorage } from "./lib/storage";

reportErrors();

// Version web construite : le service worker garde l'application et ses plugins pour l'utiliser hors ligne.
if (api.id === "web" && import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((err) => console.error("Mode hors ligne indisponible :", err));
}

const target = document.getElementById("app");
if (!target) throw new Error("Élément #app introuvable dans index.html");

// Réglages et plugins d'abord : les onglets et les paramètres en ont besoin dès leur création.
await initStorage();
// Les modules qui lisent les réglages sont importés seulement maintenant : ils attendent le fichier de réglages.
const { loadPlugins } = await import("./lib/plugins/registry.svelte");
await loadPlugins();
const { services } = await import("./lib/state/services.svelte");
await services.load();
const { default: App } = await import("./App.svelte");

export default mount(App, { target });
