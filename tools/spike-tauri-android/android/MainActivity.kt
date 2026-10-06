package dev.etable.spike

import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Closes the native IPC bridge to plugin frames.
 *
 * wry exposes the engine bridge with addJavascriptInterface("ipc"), which Android shows to EVERY frame of the page
 * (plugin iframes included) and reports with the URL of the top-level page, so Tauri cannot tell who is calling.
 * WebMessageListener takes a list of allowed origins: only documents served from the app's own origin get `window.ipc`,
 * and the origin of the real sender is passed on to the engine.
 */
class MainActivity : TauriActivity() {
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // Fail closed: without the restricted mechanism the bridge is removed and the app cannot talk to the engine.
    webView.removeJavascriptInterface("ipc")
    check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      "This WebView cannot restrict the engine bridge to the app origin; refusing to run with it open."
    }
    val rust = webView as RustWebView
    WebViewCompat.addWebMessageListener(webView, "ipc", setOf("http://tauri.localhost")) { _, message, sourceOrigin, isMainFrame, _ ->
      val data = message.data
      if (isMainFrame && data != null) {
        Rust.ipc(rust.id, sourceOrigin.toString(), data)
      }
    }
  }
}