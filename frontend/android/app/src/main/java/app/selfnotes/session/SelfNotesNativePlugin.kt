package app.selfnotes.session

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import androidx.core.graphics.toColorInt
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import app.selfnotes.widget.WidgetColors
import app.selfnotes.widget.WidgetTheme
import app.selfnotes.widget.WidgetUpdater
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The front's door to the native layer (docs/architecture.md §6.1). The TypeScript side is
 * frontend/src/platform/native.ts. The front never sees the refresh token.
 */
@CapacitorPlugin(name = "SelfNotesNative")
class SelfNotesNativePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val store by lazy { SessionStore.get(context) }

    /** → `{ url? }` */
    @PluginMethod
    fun getServerUrl(call: PluginCall) = run(call) {
        val result = JSObject()
        store.serverUrl()?.let { result.put("url", it) }
        call.resolve(result)
    }

    /** `{ url }`. A different server ends the current session (AUTH-7). */
    @PluginMethod
    fun setServerUrl(call: PluginCall) = run(call) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) return@run call.reject("url is required", "INVALID_ARGUMENT")
        store.setServerUrl(url)
        WidgetUpdater.requestRefresh(context) // a new server signs the widgets out too
        call.resolve()
    }

    /** `{ serverUrl, accessToken, accessTokenExpiresAt, refreshToken }`, after login or register. */
    @PluginMethod
    fun setSession(call: PluginCall) = run(call) {
        val serverUrl = call.getString("serverUrl")
        val accessToken = call.getString("accessToken")
        val expiresAt = call.getString("accessTokenExpiresAt")
        val refreshToken = call.getString("refreshToken")
        if (serverUrl.isNullOrBlank() || accessToken.isNullOrBlank() || expiresAt.isNullOrBlank() || refreshToken.isNullOrBlank()) {
            return@run call.reject("serverUrl, accessToken, accessTokenExpiresAt and refreshToken are required", "INVALID_ARGUMENT")
        }
        val expiresAtMs = IsoTime.parseMillis(expiresAt) ?: (System.currentTimeMillis() + 60_000L)
        store.setSession(serverUrl, AccessToken(accessToken, expiresAt, expiresAtMs), refreshToken)
        WidgetUpdater.requestRefresh(context) // WIDGET-8: widgets show the account at once
        call.resolve()
    }

    /**
     * `{ forceRefresh? }` → `{ accessToken, accessTokenExpiresAt }`, or `{}` when signed out.
     * Rejects with code `OFFLINE` (server unreachable) or `REFRESH_FAILED` (unexpected status):
     * the session is kept in both cases.
     */
    @PluginMethod
    fun getAccessToken(call: PluginCall) = run(call) {
        when (val result = store.getAccessToken(call.getBoolean("forceRefresh", false) == true)) {
            is TokenResult.Valid -> call.resolve(
                JSObject()
                    .put("accessToken", result.access.token)
                    .put("accessTokenExpiresAt", result.access.expiresAt),
            )
            TokenResult.SignedOut -> call.resolve(JSObject())
            TokenResult.Offline -> call.reject("The server cannot be reached.", "OFFLINE")
            is TokenResult.Failed -> call.reject("The server could not refresh the session (HTTP ${result.status}).", "REFRESH_FAILED")
        }
    }

    /** `{ revoke? }`: logout (revoke = true) or a local sign-out. */
    @PluginMethod
    fun clearSession(call: PluginCall) = run(call) {
        store.clearSession(revoke = call.getBoolean("revoke", false) == true)
        WidgetUpdater.requestRefresh(context) // WIDGET-9: "Sign in to Self-Notes", data removed
        call.resolve()
    }

    /**
     * `{ noteId? }`, after the app saved, deleted or left a note (WIDGET-8). While the app is on
     * screen, calls that follow each other within 2 seconds make one refresh, so autosave does not
     * refresh widgets while typing. Once it left the screen there is no delay: it may be killed.
     */
    @PluginMethod
    fun refreshWidgets(call: PluginCall) {
        val onScreen = activity.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        WidgetUpdater.requestRefresh(context, delayMs = if (onScreen) 2_000 else 0)
        call.resolve()
    }

    /**
     * WIDGET-10: the resolved theme's colors (CSS colors), when the theme changes. Widgets and their
     * setup screens use them; widgets redraw without a network call.
     */
    @PluginMethod
    fun setWidgetTheme(call: PluginCall) = run(call) {
        val keys = listOf("background", "surface", "card", "accent", "accentFill", "onAccentFill", "border", "text1", "text2", "checkbox", "codeBg")
        val colors = WidgetColors.fromCss(keys.associateWith { call.getString(it) }, call.getBoolean("dark", true) == true)
            ?: return@run call.reject("Every color must be a CSS color (#rrggbb or rgba())", "INVALID_ARGUMENT")
        if (colors != WidgetTheme.load(context)) {
            WidgetTheme.save(context, colors)
            WidgetUpdater.applyTheme(context)
        }
        call.resolve()
    }

    /**
     * `{ background: "#rrggbb", dark }` (THEME-4). The app draws edge to edge: with a recent
     * WebView the page itself paints behind the bars, with an older one Capacitor pads the WebView
     * and the window background shows there. Both get the theme's background; the bar icons are
     * light on dark themes and dark on light ones.
     */
    @PluginMethod
    fun setSystemBars(call: PluginCall) {
        val color = runCatching { call.getString("background")?.toColorInt() }.getOrNull()
            ?: return call.reject("background must be a #rrggbb color", "INVALID_ARGUMENT")
        systemBars = color to (call.getBoolean("dark", true) == true)
        activity.runOnUiThread { applySystemBars() }
        call.resolve()
    }

    @Volatile private var systemBars: Pair<Int, Boolean>? = null

    private fun applySystemBars() {
        val (color, dark) = systemBars ?: return
        val window = activity.window
        window.decorView.setBackgroundColor(color)
        bridge.webView.setBackgroundColor(color)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    /**
     * NOTE-15: addresses in notes are geo: links. Always show the app chooser, so that the user
     * picks among their maps apps, even when one of them was set as the default.
     */
    override fun shouldOverrideLoad(url: Uri): Boolean? {
        if (!url.scheme.equals("geo", ignoreCase = true)) return null
        try {
            activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW, url), "Open with"))
        } catch (_: ActivityNotFoundException) {
            // no maps app installed: nothing to open
        }
        return true
    }

    // Capacitor's SystemBars plugin resets the bars on configuration changes: apply ours after it.
    override fun handleOnConfigurationChanged(newConfig: Configuration) {
        activity.window.decorView.post { applySystemBars() }
    }

    override fun handleOnDestroy() {
        scope.cancel()
    }

    /** Runs off the main thread. An unexpected exception still answers the call. */
    private fun run(call: PluginCall, block: suspend () -> Unit) {
        scope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                call.reject(e.message ?: e.javaClass.simpleName, "NATIVE_ERROR", e)
            }
        }
    }
}
