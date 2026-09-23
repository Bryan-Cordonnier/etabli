<script lang="ts">
  // Cadre isolé d'une mini-app (cahier des charges, section 8.3). Le cadre n'a ni accès au disque,
  // ni accès à Rust : il ne communique qu'avec ce composant, par un MessagePort privé.
  import {
    CONNECT,
    PROTOCOL_VERSION,
    type ColorScheme,
    type DocumentSnapshot,
    type HostToPlugin,
    type PluginToHost,
    type ThemeTokens,
  } from "@etabli/sdk/protocol";
  import { inTauri } from "$lib/api";
  import { printFiche } from "$lib/print/print";
  import { libraries } from "$lib/state/libraries.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { THEME_TOKENS } from "$lib/themes";

  // Dans l'application : origine opaque, isolation totale. Dans l'aperçu navigateur de développement
  // (plugins officiels uniquement), certains navigateurs refusent les cadres opaques : on les autorise
  // alors à garder leur origine.
  const sandbox = inTauri ? "allow-scripts" : "allow-scripts allow-same-origin";

  interface Props {
    src: string;
    title: string;
    pluginId: string;
    appId: string;
    /** Document transmis à l'ouverture ; la mini-app gère ensuite ses données elle-même. */
    initial: DocumentSnapshot;
    /** Titre actuel du calcul, pour les fiches imprimées. */
    docTitle?: string;
    onmessage: (message: PluginToHost) => void;
  }

  let { src, title, pluginId, appId, initial, docTitle = "", onmessage }: Props = $props();

  let frame: HTMLIFrameElement;
  let port: MessagePort | undefined;
  let height = $state(320);

  function readTheme(): { theme: ThemeTokens; colorScheme: ColorScheme } {
    const style = getComputedStyle(document.documentElement);
    const theme: ThemeTokens = {};
    for (const token of THEME_TOKENS) theme[token] = style.getPropertyValue(`--${token}`).trim();
    return { theme, colorScheme: style.colorScheme.includes("dark") ? "dark" : "light" };
  }

  function send(message: HostToPlugin): void {
    port?.postMessage(message);
  }

  // Dernières valeurs connues de la mini-app : on ne lui renvoie pas ce qu'elle vient d'envoyer.
  let sentLibraries = "";
  let sentPluginData = "";

  async function connectFrame(): Promise<void> {
    port?.close();
    port = undefined;
    const pluginData = await libraries.loadPlugin(pluginId);
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (event: MessageEvent<PluginToHost>) => {
      const message = event.data;
      switch (message.type) {
        case "height":
          height = Math.max(160, Math.ceil(message.value));
          break;
        case "pluginData":
          sentPluginData = JSON.stringify(message.data);
          libraries.setPluginData(pluginId, message.data);
          break;
        case "print":
          printFiche(
            { ...message.fiche, title: message.fiche.title.trim() || docTitle.trim() || title },
            { author: settings.author, date: new Date() },
          );
          break;
        default:
          onmessage(message);
      }
    };
    sentLibraries = JSON.stringify(libraries.current);
    sentPluginData = JSON.stringify(pluginData);
    // Origine opaque du cadre isolé : « * » est la seule cible possible, le port reste privé.
    frame.contentWindow?.postMessage({ type: CONNECT }, "*", [channel.port2]);
    send({
      type: "init",
      protocol: PROTOCOL_VERSION,
      pluginId,
      appId,
      document: JSON.parse(JSON.stringify(initial)),
      ...readTheme(),
      libraries: JSON.parse(sentLibraries),
      pluginData: JSON.parse(sentPluginData),
    });
  }

  // Fournisseurs modifiés dans les Paramètres, ou réglages du plugin changés par une autre mini-app.
  $effect(() => {
    const json = JSON.stringify(libraries.current);
    if (!port || json === sentLibraries) return;
    sentLibraries = json;
    send({ type: "libraries", libraries: JSON.parse(json) });
  });

  $effect(() => {
    const json = JSON.stringify($state.snapshot(libraries.pluginData[pluginId]) ?? null);
    if (!port || json === sentPluginData) return;
    sentPluginData = json;
    send({ type: "pluginData", data: JSON.parse(json) });
  });

  // Changement de thème (réglage ou mode sombre de Windows) : la mini-app suit.
  $effect(() => {
    void settings.theme;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const push = () => requestAnimationFrame(() => send({ type: "theme", ...readTheme() }));
    push();
    media.addEventListener("change", push);
    return () => media.removeEventListener("change", push);
  });

  $effect(() => () => port?.close());
</script>

<iframe
  bind:this={frame}
  {src}
  {title}
  {sandbox}
  allow="clipboard-write"
  onload={connectFrame}
  style:height="{height}px"
></iframe>

<style>
  iframe {
    display: block;
    width: 100%;
    border: 0;
    background: transparent;
    color-scheme: normal;
  }
</style>
