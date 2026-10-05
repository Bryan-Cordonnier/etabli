package fr.etabli.app;

import android.content.res.AssetManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Une origine par plugin sur Android : les requêtes vers {@code https://<id>.plugins.localhost} sont servies ici,
 * depuis les ressources embarquées de l'application, sans jamais toucher au réseau (même principe que
 * {@code WebViewLocalServer} de Capacitor pour l'application elle-même, et mêmes règles que le serveur Établi).
 *
 * <p>Chaque plugin a ainsi sa propre origine : stockage, cookies et IndexedDB séparés de ceux de l'application et des
 * autres plugins, comme sur PC (docs/19). Le cadre reçoit {@code sandbox="allow-scripts allow-same-origin"} (docs/19, §4).
 *
 * <p>Tout ce qui vise le domaine des plugins et n'est pas une demande valide reçoit une réponse 404 locale : rien ne part
 * vers le réseau. Les autres adresses suivent le comportement habituel de Capacitor.
 */
public class OriginesPlugins extends BridgeWebViewClient {

    private final Bridge bridge;
    private final AssetManager assets;

    public OriginesPlugins(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        this.assets = bridge.getContext().getAssets();
    }

    /** Origine de l'application, par exemple {@code https://localhost}. */
    private String origineApplication() {
        return bridge.getScheme() + "://" + bridge.getHost();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (!CheminsPlugins.concerne(url)) {
            return super.shouldInterceptRequest(view, request);
        }
        try {
            return repondre(request.getMethod(), url);
        } catch (RuntimeException e) {
            // Quoi qu'il arrive, jamais de requête réseau pour ce domaine.
            return reponseVide(500, "Internal Error");
        }
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // Un cadre (mini-app) se charge toujours dans le WebView : l'ouverture d'un navigateur externe, que Capacitor
        // fait pour toute adresse étrangère, n'a pas à être déclenchée par une page de plugin.
        if (!request.isForMainFrame()) return false;
        // Le domaine des plugins ne s'ouvre jamais comme page principale : elle prendrait la place de l'application.
        if (CheminsPlugins.concerne(request.getUrl().toString())) return true;
        return super.shouldOverrideUrlLoading(view, request);
    }

    /** Réponse pour une adresse du domaine des plugins ; GET et HEAD seulement. */
    WebResourceResponse repondre(String methode, String url) {
        boolean tete = "HEAD".equalsIgnoreCase(methode);
        if (!tete && !"GET".equalsIgnoreCase(methode)) {
            return reponseVide(405, "Method Not Allowed");
        }
        CheminsPlugins.Demande demande = CheminsPlugins.analyser(url);
        if (demande == null) return reponseVide(404, "Not Found");

        String chemin = demande.cheminAsset();
        InputStream flux;
        try {
            flux = assets.open(chemin, AssetManager.ACCESS_STREAMING);
        } catch (IOException e) {
            // Fichier absent, ou dossier : introuvable.
            return reponseVide(404, "Not Found");
        }
        if (tete) {
            try {
                flux.close();
            } catch (IOException ignore) {
                // rien à faire
            }
            flux = new ByteArrayInputStream(new byte[0]);
        }
        String type = CheminsPlugins.typeMime(demande.chemin);
        int pointVirgule = type.indexOf(';');
        String mime = pointVirgule < 0 ? type : type.substring(0, pointVirgule);
        String codage = pointVirgule < 0 ? null : "utf-8";
        Map<String, String> entetes = entetesSecurite();
        entetes.put("Content-Security-Policy", CheminsPlugins.csp(origineApplication()));
        return new WebResourceResponse(mime, codage, 200, "OK", entetes, flux);
    }

    private WebResourceResponse reponseVide(int statut, String raison) {
        return new WebResourceResponse("text/plain", "utf-8", statut, raison, entetesSecurite(), new ByteArrayInputStream(new byte[0]));
    }

    /** En-têtes communs à toutes les réponses du domaine des plugins. */
    private Map<String, String> entetesSecurite() {
        Map<String, String> entetes = new HashMap<>();
        entetes.put("Cache-Control", "no-cache");
        entetes.put("X-Content-Type-Options", "nosniff");
        entetes.put("Referrer-Policy", "no-referrer");
        // Origine propre au plugin dans son propre groupe : « document.domain » ne peut pas la relâcher.
        entetes.put("Origin-Agent-Cluster", "?1");
        return entetes;
    }
}
