<script lang="ts">
  // Cadre isolé d'une mini-app (cahier des charges, section 8.3). Le cadre n'a ni accès au disque,
  // ni accès à Rust : il ne communique qu'avec ce composant, par un MessagePort privé.
  import {
    CONNECT,
    PROTOCOL_VERSION,
    type DocumentSnapshot,
    type HostToPlugin,
    type Incoming,
    type PluginToHost,
  } from "@etabli/sdk/protocol";
  import { api } from "$lib/api";
  import { traiterRappels } from "$lib/mobile/rappelsHote";
  import { printFiche } from "$lib/print/print";
  import { frameShortcuts } from "$lib/shortcuts";
  import { sandboxDe, lireTheme } from "$lib/plugins/cadre";
  import { controler, erreurService, idAppel, type Contexte } from "$lib/plugins/garde";
  import { connues, estStrict } from "$lib/plugins/permissions";
  import { getPlugin } from "$lib/plugins/registry.svelte";
  import { routeur } from "$lib/state/appels.svelte";
  import { pluginData } from "$lib/state/pluginData.svelte";
  import { librariesFrom, services } from "$lib/state/services.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { ui } from "$lib/state/ui.svelte";

  // Dans l'application : origine opaque, isolation totale. Dans l'aperçu navigateur de développement
  // (plugins officiels uniquement), certains navigateurs refusent les cadres opaques : on les autorise
  // alors à garder leur origine.

  interface Props {
    src: string;
    title: string;
    pluginId: string;
    appId: string;
    /** Document transmis à l'ouverture ; la mini-app gère ensuite ses données elle-même. */
    initial: DocumentSnapshot;
    /** Titre actuel du calcul, pour les fiches imprimées. */
    docTitle?: string;
    /** Données envoyées par une autre mini-app, transmises à la première ouverture seulement. */
    incoming?: Incoming | null;
    /**
     * Transmettre au cadre les raccourcis réglés par l'utilisateur, pour qu'il les renvoie au moteur.
     * Faux dans l'aperçu rapide, qui n'a pas d'onglets à piloter.
     */
    forward?: boolean;
    onmessage: (message: PluginToHost) => void;
  }

  let { src, title, pluginId, appId, initial, docTitle = "", incoming = null, forward = true, onmessage }: Props = $props();

  // Avec une origine propre au plugin (serveur, ou Android : https://<id>.plugins.localhost servie par la partie native),
  // le cadre peut garder son origine : elle ne contient rien d'autre que
  // ce plugin. C'est ce qui permet à son service worker de le servir hors ligne.
  const sandbox = $derived(sandboxDe(pluginId));
  let incomingSent = false;

  /** Ce que le manifeste du plugin autorise (docs/19) ; relu à chaque message, le manifeste pouvant changer. */
  function contexte(): Contexte {
    const manifeste = getPlugin(pluginId);
    return {
      permissions: connues(manifeste?.permissions ?? []),
      strict: manifeste ? estStrict(manifeste.apiVersion) : true,
      provides: Object.keys(manifeste?.provides ?? {}),
    };
  }

  let frame: HTMLIFrameElement;
  let port: MessagePort | undefined;
  let height = $state(320);
  /**
   * Le cadre reste invisible tant que la mini-app n'a pas appliqué le thème et dessiné son contenu
   * (message « ready ») : sinon on voit un instant la page blanche, avant ses couleurs et ses données.
   * Filet de sécurité pour un plugin compilé avec un SDK plus ancien : affiché au bout d'une seconde.
   */
  let ready = $state(false);
  let readyTimer: ReturnType<typeof setTimeout> | undefined;

  const readTheme = lireTheme;

  function send(message: HostToPlugin): void {
    port?.postMessage(message);
  }

  // Dernières valeurs connues de la mini-app : on ne lui renvoie pas ce qu'elle vient d'envoyer.
  let sentServices = "";
  let sentPluginData = "";

  async function connectFrame(): Promise<void> {
    port?.close();
    port = undefined;
    ready = false;
    clearTimeout(readyTimer);
    readyTimer = setTimeout(() => (ready = true), 1000);
    const savedData = await pluginData.load(pluginId);
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (event: MessageEvent<PluginToHost>) => {
      // Tout ce qui vient du cadre est contrôlé avant d'être traité (forme, taille, permissions).
      const verdict = controler(event.data, contexte());
      if (!verdict.ok) {
        console.warn(`[Établi] message refusé de ${pluginId} : ${verdict.raison}`);
        // Un appel de service refusé reçoit sa réponse typée : l'appelant n'attend pas en vain.
        const appel = idAppel(event.data);
        if (appel) send({ type: "serviceReply", id: appel, result: erreurService(verdict.code ?? "argument_invalide", verdict.raison) });
        return;
      }
      const message = verdict.message;
      switch (message.type) {
        case "ready":
          clearTimeout(readyTimer);
          ready = true;
          break;
        case "height":
          height = Math.max(160, Math.ceil(message.value));
          break;
        case "pluginData":
          sentPluginData = JSON.stringify(message.data);
          pluginData.set(pluginId, message.data);
          break;
        case "provide":
          // Le moteur ne garde que les services que le manifeste du plugin déclare (`provides`).
          services.publish(pluginId, message.name, message.data);
          break;
        case "serviceCall": {
          // L'appelant est le plugin de ce cadre, connu de l'hôte : le message ne peut pas dire autre chose.
          const id = message.id;
          void routeur
            .appeler(pluginId, { service: message.service, fn: message.fn, args: message.args, timeoutMs: message.timeoutMs })
            .then((result) => send({ type: "serviceReply", id, result }));
          break;
        }
        case "reminders": {
          // Permission `notifications` déjà contrôlée par la garde ; seul l'hôte parle aux notifications natives.
          const id = message.id;
          void traiterRappels(pluginId, message).then((result) => send({ type: "remindersResult", id, result }));
          break;
        }
        case "saveFile":
          api.saveFile(message.file).then(
            (path) => path && ui.notify(`Enregistré : ${path}`),
            (err) => ui.notify(`Enregistrement impossible : ${err}`),
          );
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
    const visible = services.snapshotFor(pluginId);
    sentServices = JSON.stringify(visible);
    sentPluginData = JSON.stringify(savedData);
    // Origine opaque du cadre isolé : « * » est la seule cible possible, le port reste privé.
    frame.contentWindow?.postMessage({ type: CONNECT }, "*", [channel.port2]);
    send({
      type: "init",
      protocol: PROTOCOL_VERSION,
      pluginId,
      appId,
      document: JSON.parse(JSON.stringify(initial)),
      ...readTheme(),
      libraries: librariesFrom(visible),
      services: visible,
      pluginData: JSON.parse(sentPluginData),
      // Si le cadre se recharge, les données reçues ne sont pas appliquées une seconde fois.
      incoming: incoming && !incomingSent ? JSON.parse(JSON.stringify(incoming)) : null,
      shortcuts: forward ? frameShortcuts() : [],
    });
    incomingSent = true;
  }

  // Raccourcis modifiés dans les Paramètres pendant que la mini-app est ouverte.
  $effect(() => {
    const list = forward ? frameShortcuts() : [];
    if (port) send({ type: "shortcuts", shortcuts: list });
  });

  // Un service que ce plugin lit a changé (fournisseurs modifiés…), ou un plugin dont il dépend a été
  // installé, désinstallé, activé ou désactivé.
  $effect(() => {
    const visible = services.snapshotFor(pluginId);
    const json = JSON.stringify(visible);
    if (!port || json === sentServices) return;
    sentServices = json;
    send({ type: "services", services: visible });
    send({ type: "libraries", libraries: librariesFrom(visible) });
  });

  // Réglages du plugin changés par une autre mini-app.
  $effect(() => {
    const json = JSON.stringify($state.snapshot(pluginData.data[pluginId]) ?? null);
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

  $effect(() => () => {
    port?.close();
    clearTimeout(readyTimer);
  });
</script>

<iframe
  bind:this={frame}
  {src}
  {title}
  {sandbox}
  allow="clipboard-write"
  onload={connectFrame}
  class:ready
  style:height="{height}px"
></iframe>

<style>
  iframe {
    display: block;
    width: 100%;
    border: 0;
    background: transparent;
    color-scheme: normal;
    opacity: 0;
  }
  iframe.ready {
    opacity: 1;
    transition: opacity 0.12s ease-out;
  }
</style>
