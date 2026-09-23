import { mount } from "svelte";
// Polices intégrées à l'application : elles fonctionnent hors ligne.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app");
if (!target) throw new Error("Élément #app introuvable dans index.html");

export default mount(App, { target });
