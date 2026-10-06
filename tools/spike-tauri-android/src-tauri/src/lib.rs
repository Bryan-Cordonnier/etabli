//! Spike: custom protocol `plugins` serving two "plugin" pages with a strict CSP, plus the notification plugin.
//! Questions answered by running this on a phone (see ui/index.html):
//!   1. Does a scheduled notification fire at the exact time with the app closed?
//!   2. Does a sandboxed iframe (no allow-same-origin) load a page from a custom protocol on Android?
//!   3. Is network access from that frame blocked by the CSP?
//!   4. Do two plugins get two different origins (host/path), so they cannot share storage?

use tauri::http::{header, Response, StatusCode};

/// One tiny "plugin" page. It waits for the host's MessagePort, then reports what it can and cannot do.
fn plugin_page(id: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>{id}</title></head><body>
<script>
const id = "{id}";
window.addEventListener("message", async (event) => {{
  const port = event.ports[0];
  if (!port) return;
  let networkBlocked = false;
  try {{ await fetch("https://example.com/", {{ mode: "no-cors" }}); }} catch (e) {{ networkBlocked = true; }}
  let storage = "unavailable";
  try {{ localStorage.setItem("probe", id); storage = "available"; }} catch (e) {{ storage = "blocked (opaque origin)"; }}
  // Security origin of the DOCUMENT (location.origin only reflects the URL): "null" means an opaque origin.
  const securityOrigin = String(window.origin);
  // Probe of the native bridge from inside the sandbox.
  let parentAccess = "blocked";
  try {{ void window.parent.document; parentAccess = "READABLE"; }} catch (e) {{ parentAccess = "blocked"; }}
  let parentInternals = "blocked";
  try {{ parentInternals = typeof window.parent.__TAURI_INTERNALS__; }} catch (e) {{ parentInternals = "blocked"; }}
  const bridge = {{
    ipcObject: typeof window.ipc,
    tauriInternals: typeof window.__TAURI_INTERNALS__,
    tauriGlobal: typeof window.__TAURI__,
    parentAccess,
    parentInternals,
  }};
  // A FORGED message through the Android JavaScript interface, with a guessed invoke key. The frame cannot know the real key
  // (it lives in a closure of the main frame). If the main page logs "FORGED IPC ACCEPTED", the bridge is open.
  let forged = "no ipc object";
  try {{
    if (window.ipc && window.ipc.postMessage) {{
      window.ipc.postMessage(JSON.stringify({{
        cmd: "plugin:event|emit", callback: 1, error: 2,
        payload: {{ event: "probe", payload: "forged-by-" + id }},
        options: {{ headers: {{}} }}, "__TAURI_INVOKE_KEY__": "guess",
      }}));
      forged = "sent";
    }}
  }} catch (e) {{ forged = "failed: " + String(e); }}
  // The REAL test: the frame calls the engine through the very functions Tauri injected into it (they carry the real invoke key).
  // The harmless command only emits an event the main page listens to. If the main page logs "IPC FROM PLUGIN FRAME ACCEPTED", the bridge is open.
  let realInvoke = "no __TAURI_INTERNALS__";
  try {{
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {{
      const pending = window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {{ event: "probe", payload: "REAL invoke from " + id }});
      realInvoke = await Promise.race([
        pending.then(() => "resolved", (e) => "rejected: " + String(e)),
        new Promise((r) => setTimeout(() => r("no answer in 1.5 s (check the main page for the event)"), 1500)),
      ]);
    }}
  }} catch (e) {{ realInvoke = "threw: " + String(e); }}
  port.postMessage({{ plugin: id, origin: String(location.origin), securityOrigin, href: String(location.href), networkBlocked, storage, bridge, forged, realInvoke }});
}});
</script>plugin {id} loaded</body></html>"#
    )
}

fn plugin_response(path: &str) -> Response<Vec<u8>> {
    // /<id>/index.html with <id> in {alpha, beta}
    let id = path.trim_start_matches('/').split('/').next().unwrap_or("");
    if id != "alpha" && id != "beta" {
        return Response::builder().status(StatusCode::NOT_FOUND).body(b"not found".to_vec()).unwrap();
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        // No network at all, inline script only: the same idea as the real engine's CSP for plugin pages.
        .header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'")
        .header("Access-Control-Allow-Origin", "*")
        .body(plugin_page(id).into_bytes())
        .unwrap()
}

// Test helpers so the spike can run unattended on a PC: SPIKE_AUTO=1 runs the checks on start, SPIKE_REPORT=<file> receives the log.
#[tauri::command]
fn spike_auto() -> bool {
    std::env::var("SPIKE_AUTO").is_ok()
}

#[tauri::command]
fn spike_report(text: String) {
    if let Ok(path) = std::env::var("SPIKE_REPORT") {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{text}");
        }
    }
}

#[tauri::command]
fn spike_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![spike_auto, spike_report, spike_exit])
        .register_uri_scheme_protocol("plugins", |_ctx, request| plugin_response(request.uri().path()))
        .run(tauri::generate_context!())
        .expect("error while running the spike");
}