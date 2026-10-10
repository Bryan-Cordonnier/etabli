package __PACKAGE__

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.ContextCompat
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

  private fun telechargerEtInstaller(adresse: String) {
    val uri = Uri.parse(adresse)
    if (uri.scheme != "https" || uri.host.isNullOrEmpty() || !(uri.path ?: "").endsWith(".apk")) return
    if (!packageManager.canRequestPackageInstalls()) {
      // Première fois : Android demande d'autoriser l'application à installer des mises à jour.
      startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
      Toast.makeText(this, "Autorisez l'application à installer ses mises à jour, puis appuyez de nouveau sur Télécharger.", Toast.LENGTH_LONG).show()
      return
    }
    val gestionnaire = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val demande = DownloadManager.Request(uri)
      .setTitle("Mise à jour de l'application")
      .setMimeType("application/vnd.android.package-archive")
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "mise-a-jour.apk")
    val numero = gestionnaire.enqueue(demande)
    val recepteur = object : BroadcastReceiver() {
      override fun onReceive(contexte: Context, intention: Intent) {
        if (intention.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != numero) return
        unregisterReceiver(this)
        val fichier = gestionnaire.getUriForDownloadedFile(numero) ?: return
        startActivity(
          Intent(Intent.ACTION_VIEW)
            .setDataAndType(fichier, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
      }
    }
    ContextCompat.registerReceiver(this, recepteur, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED)
    Toast.makeText(this, "Téléchargement de la mise à jour…", Toast.LENGTH_SHORT).show()
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
      // Mise à jour de l'application : l'interface demande de télécharger l'APK (adresse https) ; Android le télécharge (barre de
      // progression dans la notification) puis ouvre l'installateur. Même règle que le pont : seule l'origine de l'application peut le demander.
      WebViewCompat.addWebMessageListener(webView, "etabliInstaller", setOf("http://tauri.localhost")) { _, message, _, isMainFrame, _ ->
        val adresse = message.data
        if (isMainFrame && adresse != null) telechargerEtInstaller(adresse)
      }
      // Le premier document a été chargé avec l'ancienne interface : on recharge pour que l'application utilise la nouvelle.
      webView.reload()
    }
  }
}