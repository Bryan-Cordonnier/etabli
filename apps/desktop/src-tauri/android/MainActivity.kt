package __PACKAGE__

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Remplace le MainActivity généré par Tauri (voir `android/appliquer-correctifs.mjs` et docs/26).
 *
 * Ferme le pont natif aux cadres des plugins. wry expose le pont du moteur avec `addJavascriptInterface("ipc")`, que
 * Android montre à TOUS les cadres de la page (iframes de plugins comprises) en annonçant l'adresse de la page du sommet :
 * Tauri ne peut donc pas savoir qui appelle. `WebMessageListener` reçoit la liste des origines permises : seuls les
 * documents servis par l'origine de l'application reçoivent `window.ipc`, et la vraie origine de l'expéditeur est transmise.
 *
 * L'ordre compte : wry crée la vue, appelle ce crochet, lance le chargement, et SEULEMENT ENSUITE ajoute son interface
 * « ipc ». La retirer dans le crochet ne retirerait rien : le remplacement part une fois la création finie.
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Android 15 impose l'affichage bord à bord : sans cela, la barre de l'application passe sous l'heure et la barre d'état.
    // Le contenu est donc décalé de la hauteur des barres système (et de l'encoche éventuelle).
    ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { vue, insets ->
      val barres = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
      vue.setPadding(barres.left, barres.top, barres.right, barres.bottom)
      insets
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // Échec fermé : sans ce mécanisme, on refuse de démarrer plutôt que de laisser le pont ouvert.
    check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      "Ce WebView ne sait pas limiter le pont du moteur à l'origine de l'application : démarrage refusé."
    }
    val rust = webView as RustWebView
    webView.post {
      webView.removeJavascriptInterface("ipc")
      WebViewCompat.addWebMessageListener(webView, "ipc", setOf("http://tauri.localhost")) { _, message, sourceOrigin, isMainFrame, _ ->
        val data = message.data
        if (isMainFrame && data != null) {
          Rust.ipc(rust.id, sourceOrigin.toString(), data)
        }
      }
      // Le premier document a été chargé avec l'ancienne interface : on recharge pour que l'application utilise la nouvelle.
      webView.reload()
    }
  }
}