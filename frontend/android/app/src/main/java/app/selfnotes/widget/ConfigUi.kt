package app.selfnotes.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withTimeoutOrNull

/** Material colors from the app's theme (WIDGET-10), so that the setup screens look like the app. */
@Composable
fun ConfigTheme(colors: WidgetColors, content: @Composable () -> Unit) {
    val c = { argb: Int -> Color(argb) }
    val scheme = if (colors.dark) {
        darkColorScheme(
            primary = c(colors.accentFill), onPrimary = c(colors.onAccentFill),
            secondary = c(colors.accent), onSecondary = c(colors.onAccentFill),
            background = c(colors.background), onBackground = c(colors.text1),
            surface = c(colors.surface), onSurface = c(colors.text1),
            surfaceVariant = c(colors.card), onSurfaceVariant = c(colors.text2),
            surfaceContainerHighest = c(colors.card), outline = c(colors.text2), outlineVariant = c(colors.border),
        )
    } else {
        lightColorScheme(
            primary = c(colors.accentFill), onPrimary = c(colors.onAccentFill),
            secondary = c(colors.accent), onSecondary = c(colors.onAccentFill),
            background = c(colors.background), onBackground = c(colors.text1),
            surface = c(colors.surface), onSurface = c(colors.text1),
            surfaceVariant = c(colors.card), onSurfaceVariant = c(colors.text2),
            surfaceContainerHighest = c(colors.card), outline = c(colors.text2), outlineVariant = c(colors.border),
        )
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

/** Title, scrolling body, then the Cancel and confirm buttons. */
@Composable
fun ConfigScreen(
    title: String,
    confirmLabel: String?,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    body: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.secondary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            Column(modifier = Modifier.weight(1f).fillMaxWidth(), content = body)
            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onCancel) { Text("Cancel") }
                if (confirmLabel != null) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(onClick = onConfirm) { Text(confirmLabel) }
                }
            }
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
fun RadioRow(selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Spacer(modifier = Modifier.width(12.dp))
        content()
    }
}

/** Edge to edge, with bar icons that stay readable on the theme's background. */
fun ComponentActivity.edgeToEdge(colors: WidgetColors) {
    val transparent = android.graphics.Color.TRANSPARENT
    val style = if (colors.dark) SystemBarStyle.dark(transparent) else SystemBarStyle.light(transparent, transparent)
    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
}

/** Shared by both setup screens. */
object WidgetSetup {
    /**
     * The widget being configured, from the launcher's intent (or the "Pick another note" button).
     * Null unless it is one of this app's widgets.
     */
    fun widgetId(activity: Activity): Int? {
        val id = activity.intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return null
        val info = AppWidgetManager.getInstance(activity).getAppWidgetInfo(id) ?: return null
        return id.takeIf { info.provider.packageName == activity.packageName }
    }

    fun receiverOf(context: Context, appWidgetId: Int): String? =
        AppWidgetManager.getInstance(context).getAppWidgetInfo(appWidgetId)?.provider?.className

    fun result(appWidgetId: Int): Intent = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

    suspend fun currentConfig(context: Context, appWidgetId: Int): WidgetConfig? {
        val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
        val prefs = androidx.glance.appwidget.state.getAppWidgetState(
            context, androidx.glance.state.PreferencesGlanceStateDefinition, glanceId,
        )
        return WidgetConfig.fromJson(prefs[WidgetKeys.CONFIG])
    }

    /**
     * Saves the configuration together with its data, so that the widget goes straight from the old
     * content to the new one. Through "Loading…" its list would disappear for a moment, and Android
     * 11 and older draw a list that comes back within 5 seconds with its old rows. "Loading…" only
     * shows when the server is slow.
     */
    suspend fun save(context: Context, appWidgetId: Int, config: WidgetConfig) {
        val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
        val theme = WidgetTheme.load(context).toJson()
        // In its own scope: a blocking network call cannot be cancelled, only left behind.
        val fetching = CoroutineScope(Dispatchers.IO).async { WidgetUpdater.fetch(context, config) }
        val result = withTimeoutOrNull(FETCH_TIMEOUT_MS) { fetching.await() }
        updateAppWidgetState(context, glanceId) { prefs ->
            prefs[WidgetKeys.CONFIG] = config.toJson()
            prefs[WidgetKeys.THEME] = theme
            prefs[WidgetKeys.STATUS] = WidgetStatus.LOADING.name
            prefs[WidgetKeys.STALE] = false
            prefs.remove(WidgetKeys.DATA)
            prefs.remove(WidgetKeys.UPDATED_AT)
            if (result != null) WidgetUpdater.apply(prefs, result, theme, System.currentTimeMillis())
        }
        WidgetUpdater.widgetOf(context, glanceId)?.update(context, glanceId)
        WidgetUpdater.schedulePeriodic(context)
        if (result == null) WidgetUpdater.requestRefresh(context)
    }

    private const val FETCH_TIMEOUT_MS = 4_000L
}
