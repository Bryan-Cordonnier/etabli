import "@etabli/sdk/base.css";
import { mount } from "svelte";
import Fournisseurs from "./Fournisseurs.svelte";

mount(Fournisseurs, { target: document.getElementById("app")! });
