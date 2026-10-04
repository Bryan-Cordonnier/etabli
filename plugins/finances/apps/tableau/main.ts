import "@etabli/sdk/base.css";
import { mount } from "svelte";
import Tableau from "./Tableau.svelte";

mount(Tableau, { target: document.getElementById("app")! });
