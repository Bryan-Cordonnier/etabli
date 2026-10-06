<script lang="ts">
  // Cadre INVISIBLE d'un fournisseur de service (docs/24, A.1.2) : charge la page `serviceEntry` du plugin, lui transmet
  // un seul appel, attend sa réponse, puis le composant est détruit (ServiceHost). Même isolement qu'une mini-app :
  // même `sandbox`, même origine par plugin, même CSP côté serveur de fichiers, même garde — en plus étroit : ce cadre
  // n'a droit qu'aux réglages de son plugin, à la publication de ses services et à sa réponse (garde, `service: true`).
  import { CONNECT, PROTOCOL_VERSION, type HostToPlugin, type PluginToHost } from "@etabli/sdk/protocol";
  import { traiterRappels } from "$lib/mobile/rappelsHote";
  import { lireTheme, sandboxDe } from "$lib/plugins/cadre";
  import { controler, erreurService, idAppel, type Contexte } from "$lib/plugins/garde";
  import { connues, estStrict } from "$lib/plugins/permissions";
  import { getPlugin } from "$lib/plugins/registry.svelte";
  import { hote, type CadreService } from "$lib/state/appels.svelte";
  import { pluginData } from "$lib/state/pluginData.svelte";
  import { librariesFrom, services } from "$lib/state/services.svelte";

  let { cadre }: { cadre: CadreService } = $props();

  // Le cadre d'un appel ne change jamais (la liste est indexée par l'identifiant de l'appel).
  // svelte-ignore state_referenced_locally
  const { invocation } = cadre;
  const pluginId = invocation.fournisseur;
  let port: MessagePort | undefined;
  let invoque = false;

  function contexte(): Contexte {
    const manifeste = getPlugin(pluginId);
    return {
      permissions: connues(manifeste?.permissions ?? []),
      strict: manifeste ? estStrict(manifeste.apiVersion) : true,
      provides: Object.keys(manifeste?.provides ?? {}),
      service: true,
    };
  }

  const send = (message: HostToPlugin) => port?.postMessage(message);

  let frame: HTMLIFrameElement;

  async function connectFrame(): Promise<void> {
    port?.close();
    const saved = await pluginData.load(pluginId);
    // Le composant a pu être retiré pendant le chargement : plus de cadre à connecter.
    if (!frame) return;
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (event: MessageEvent<PluginToHost>) => {
      // Un fournisseur qui répond à un appel n'en lance pas d'autre (profondeur 1) : réponse d'erreur, rien n'est routé.
      const appel = idAppel(event.data);
      if (appel) {
        send({ type: "serviceReply", id: appel, result: erreurService("profondeur_max", "Un fournisseur ne peut pas appeler un autre service.") });
        return;
      }
      const verdict = controler(event.data, contexte());
      if (!verdict.ok) {
        console.warn(`[Établi] message refusé du cadre de service de ${pluginId} : ${verdict.raison}`);
        const brut = event.data as { type?: unknown; id?: unknown } | null;
        // Réponse illisible du fournisseur : l'appelant reçoit une erreur claire plutôt que d'attendre le délai.
        if (brut && brut.type === "serviceResult" && brut.id === invocation.id) {
          hote.terminer(invocation.id, erreurService("erreur", "Réponse invalide du fournisseur."));
        }
        return;
      }
      const message = verdict.message;
      switch (message.type) {
        case "pluginData":
          pluginData.set(pluginId, message.data);
          break;
        case "provide":
          services.publish(pluginId, message.name, message.data);
          break;
        case "serviceReady":
          // Les gestionnaires sont enregistrés : l'appel part, une seule fois. L'identité de l'appelant est celle du routeur.
          if (invoque) break;
          invoque = true;
          send({
            type: "serviceInvoke",
            id: invocation.id,
            service: invocation.service,
            fn: invocation.fn,
            args: invocation.args,
            caller: invocation.appelant,
          });
          break;
        case "serviceResult":
          if (message.id === invocation.id) hote.terminer(invocation.id, message.result);
          break;
        case "reminders": {
          // Le fournisseur (l'Agenda) programme les rappels que d'autres plugins lui ont confiés : permission `notifications` contrôlée par la garde.
          const id = message.id;
          void traiterRappels(pluginId, message).then((result) => send({ type: "remindersResult", id, result }));
          break;
        }
        default:
          break; // ready, height : sans objet pour un cadre invisible
      }
    };
    const visible = services.snapshotFor(pluginId);
    frame.contentWindow?.postMessage({ type: CONNECT }, "*", [channel.port2]);
    send({
      type: "init",
      protocol: PROTOCOL_VERSION,
      pluginId,
      appId: "service",
      document: { id: null, title: "", data: null },
      ...lireTheme(),
      libraries: librariesFrom(visible),
      services: visible,
      pluginData: JSON.parse(JSON.stringify($state.snapshot(saved) ?? null)),
      incoming: null,
      shortcuts: [],
    });
  }

  $effect(() => () => port?.close());
</script>

<!-- Hors écran, sans taille, sans focus, caché aux lecteurs d'écran : le fournisseur n'a aucune interface. -->
<iframe
  bind:this={frame}
  src={cadre.src}
  title={`Service ${pluginId}`}
  sandbox={sandboxDe(pluginId)}
  aria-hidden="true"
  tabindex="-1"
  onload={connectFrame}
></iframe>

<style>
  iframe {
    position: fixed;
    left: -10px;
    top: -10px;
    width: 1px;
    height: 1px;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }
</style>
