// Point d'entrée de la fenêtre d'aperçu rapide (cahier des charges, section 6).
import { mount } from "svelte";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./app.css";
import { reportErrors } from "./lib/errors";
import { loadPlugins } from "./lib/plugins/registry";
import { initStorage } from "./lib/storage";

reportErrors();

const target = document.getElementById("app");
if (!target) throw new Error("Élément #app introuvable dans apercu.html");

await Promise.all([initStorage(), loadPlugins()]);
const { default: Apercu } = await import("./Apercu.svelte");

export default mount(Apercu, { target });
