package fr.etabli.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor local : dit à l'interface si l'origine par plugin est disponible (docs/19, §4).
 *
 * <p>L'interface ne s'y fie que pour choisir entre deux modes ; un plugin hostile ne peut pas l'appeler (le pont natif
 * est limité à la page principale de l'application, voir {@link MainActivity}). Si la réponse n'arrive pas, l'interface
 * retombe sur le repli prudent.
 */
@CapacitorPlugin(name = "EtabliOrigines")
public class EtabliOriginesPlugin extends Plugin {

    /** Version du contrat entre l'interface et la partie native. */
    static final int VERSION = 1;

    @PluginMethod
    public void etat(PluginCall appel) {
        JSObject reponse = new JSObject();
        reponse.put("version", VERSION);
        // Vrai seulement si l'interception de la WebView est bien en place.
        reponse.put("origines", getBridge().getWebViewClient() instanceof OriginesPlugins);
        reponse.put("modele", CheminsPlugins.MODELE);
        // Si cet appel arrive, c'est par le pont à règles d'origine : MainActivity retire l'ancien pont (accessible de
        // tous les cadres), donc un pont qui répond est forcément le pont réservé à la page principale.
        reponse.put("pont", "isole");
        appel.resolve(reponse);
    }
}
