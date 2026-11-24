package io.karinsjigsaw.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null && android.os.Build.VERSION.SDK_INT >= 29) {
            // the page has its own themes (light, dark, ...): a phone in dark mode must not darken it again (that turns the colours and the text colours wrong)
            getBridge().getWebView().getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        openPageFromIntent(getIntent(), 2500); // cold start: wait for the page to load
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openPageFromIntent(intent, 0);
    }

    private void openPageFromIntent(Intent intent, long delayMs) {
        if (intent == null) return;
        String url = pathOfWebsiteLink(intent.getData()); // a link of the website opened the app (see the intent filter in the manifest)
        if (url == null || !url.startsWith("/") || url.startsWith("//")) return; // only pages of the app itself

        intent.setData(null); // used once
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        final String js = "window.location.assign(" + JSONObject.quote(url) + ")";
        web.postDelayed(() -> web.evaluateJavascript(js, null), delayMs);
    }

    /**
     * A link of the website, opened from the browser or a message: the app shows the live website, so the page of the link (path and query) is opened in it.
     */
    private static String pathOfWebsiteLink(Uri link) {
        if (link == null || !"https".equals(link.getScheme())) return null;
        String host = link.getHost();
        if (!"karins-jigsaw.web.app".equals(host)) return null;
        String path = link.getEncodedPath() == null || link.getEncodedPath().isEmpty() ? "/" : link.getEncodedPath();
        return link.getEncodedQuery() == null ? path : path + "?" + link.getEncodedQuery();
    }
}
