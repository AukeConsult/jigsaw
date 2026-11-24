package io.karinsjigsaw.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    /** The height of the status bar over the web page, in dp (0 when the page starts below it): the page reads it as SfInsets.topDp() and pads its header. */
    private volatile int topInsetDp = 0;

    private final class Insets_ {
        @android.webkit.JavascriptInterface
        public int topDp() {
            return topInsetDp;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // the WebView does not always tell the page that the app is back in front (no visibilitychange): the page is told here (app-update, Home and presence listen)
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('sf-resume'))", null);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new Insets_(), "SfInsets");
        }
        if (getBridge() != null && getBridge().getWebView() != null && android.os.Build.VERSION.SDK_INT >= 29) {
            // the page has its own themes (light, dark, ...): a phone in dark mode must not darken it again (that turns the colours and the text colours wrong)
            getBridge().getWebView().getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        trackStatusBar();
        openPageFromIntent(getIntent(), 2500); // cold start: wait for the page to load
    }

    /** No bar of ours: the page draws under the status bar, so it is told how high the status bar is (it pads its header by that). */
    private void trackStatusBar() {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;
        final float density = getResources().getDisplayMetrics().density;
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets top = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            topInsetDp = Math.round(top.top / density);
            final WebView web = getBridge() != null ? getBridge().getWebView() : null;
            if (web != null) web.evaluateJavascript("document.documentElement.style.setProperty('--sf-native-top','" + topInsetDp + "px')", null);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
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
     * A friend invitation or the email sign-in link, opened from the browser or a message: the app shows the live website, so the
     * page of the link (path and query) is opened in it. The web app reads the invitation from the address (friend-link.service.ts).
     */
    private static String pathOfWebsiteLink(Uri link) {
        if (link == null || !"https".equals(link.getScheme())) return null;
        String host = link.getHost();
        if (!"karins-jigsaw.web.app".equals(host)) return null;
        String path = link.getEncodedPath() == null || link.getEncodedPath().isEmpty() ? "/" : link.getEncodedPath();
        return link.getEncodedQuery() == null ? path : path + "?" + link.getEncodedQuery();
    }
}
