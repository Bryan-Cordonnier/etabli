package fr.etabli.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Activité principale. Deux ajouts à Capacitor (docs/19, §4) :
 *
 * <ol>
 *   <li>une origine par plugin : {@link OriginesPlugins} sert {@code https://<id>.plugins.localhost} depuis les ressources
 *       embarquées ;
 *   <li>un pont natif réservé à la page principale : les objets JavaScript que Capacitor ajoute à <em>tous</em> les cadres
 *       (ancien pont {@code androidBridge}, {@code CapacitorHttpAndroidInterface}, {@code CapacitorCookiesAndroidInterface})
 *       sont retirés. Le pont à règles d'origine ({@code WebMessageListener}, limité à l'origine de l'application et à la
 *       page principale) reste le seul : un cadre de mini-app ne peut pas appeler les alarmes ni les notifications.
 * </ol>
 */
public class MainActivity extends BridgeActivity {

    /** Objets que Capacitor expose à tous les cadres de la WebView avec {@code addJavascriptInterface}. */
    private static final String[] INTERFACES_JS = {
        "androidBridge",
        "CapacitorHttpAndroidInterface",
        "CapacitorCookiesAndroidInterface",
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EtabliOriginesPlugin.class);
        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        // Sans effet sur le pont à règles d'origine, qui n'est pas une interface JavaScript. Si Capacitor avait dû se
        // rabattre sur l'ancien pont (WebView trop ancienne), celui-ci disparaît : les fonctions natives ne répondent
        // plus, mais aucun cadre n'y a accès. Retrait fait avant le premier chargement de page.
        for (String nom : INTERFACES_JS) webView.removeJavascriptInterface(nom);
        bridge.setWebViewClient(new OriginesPlugins(bridge));
    }
}
