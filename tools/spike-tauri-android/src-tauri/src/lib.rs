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
  port.postMessage({{ plugin: id, origin: String(location.origin), href: String(location.href), networkBlocked, storage }});
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .register_uri_scheme_protocol("plugins", |_ctx, request| plugin_response(request.uri().path()))
        .run(tauri::generate_context!())
        .expect("error while running the spike");
}