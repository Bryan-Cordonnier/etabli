import { mount } from "svelte";
// Polices intégrées à l'application : elles fonctionnent hors ligne.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./app.css";
import { loadPlugins } from "./lib/plugins/registry";
import { initStorage } from "./lib/storage";

const target = document.getElementById("app");
if (!target) throw new Error("Élément #app introuvable dans index.html");

// Réglages et plugins d'abord : les onglets et les paramètres en ont besoin dès leur création.
await Promise.all([initStorage(), loadPlugins()]);
const { default: App } = await import("./App.svelte");

export default mount(App, { target });
