package app.selfnotes.widget

import android.content.Context
import android.content.Intent
import android.os.Build
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.datastore.preferences.core.Preferences
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.selfnotes.MainActivity
import app.selfnotes.R

/** Colors from a widget's state, or the saved theme before its first refresh (WIDGET-10). */
fun colorsOf(context: Context, prefs: Preferences): WidgetColors =
    prefs[WidgetKeys.THEME]?.let(WidgetColors::fromJson) ?: WidgetTheme.load(context)

fun Int.provider(): ColorProvider = ColorProvider(Color(this))

/**
 * A rounded background of [color]. Android 12+ rounds views itself; older versions get a shape
 * drawable tinted with the color, since cornerRadius does nothing there.
 */
fun GlanceModifier.rounded(color: Int, radius: Int): GlanceModifier =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        background(color.provider()).cornerRadius(radius.dp)
    } else {
        val shape = when {
            radius >= 20 -> R.drawable.widget_round_20
            radius >= 12 -> R.drawable.widget_round_12
            else -> R.drawable.widget_round_8
        }
        background(ImageProvider(shape), colorFilter = ColorFilter.tint(color.provider()))
    }

/** Opens the app, on a note or on a new note (deep links, architecture §6.2). */
object WidgetIntents {
    fun openApp(context: Context): Intent =
        Intent(context, MainActivity::class.java).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

    fun openNote(context: Context, noteId: String): Intent =
        Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData("selfnotes://notes/$noteId".toUri())

    fun newNote(context: Context, type: NoteKind): Intent =
        Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData("selfnotes://notes/new?type=${type.api}".toUri())
}

/** The widget's rounded background. */
@Composable
fun WidgetFrame(colors: WidgetColors, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .rounded(colors.surface, 20)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        content = content,
    )
}

/** Title, then the + and refresh buttons (WIDGET-7). */
@Composable
fun WidgetHeader(title: String, colors: WidgetColors, onTitle: Action, newNote: Action?) {
    Row(modifier = GlanceModifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(color = colors.accent.provider(), fontSize = 15.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.defaultWeight().clickable(onTitle),
        )
        if (newNote != null) {
            IconButton(R.drawable.ic_widget_add, LocalContext.current.getString(R.string.widget_new_note), colors.accent, newNote)
        }
        IconButton(R.drawable.ic_widget_refresh, LocalContext.current.getString(R.string.widget_refresh), colors.text2, actionRunCallback<RefreshAction>())
    }
}

@Composable
private fun IconButton(icon: Int, description: String, tint: Int, onClick: Action) {
    Box(modifier = GlanceModifier.size(36.dp).cornerRadius(18.dp).clickable(onClick), contentAlignment = Alignment.Center) {
        Image(
            provider = ImageProvider(icon),
            contentDescription = description,
            colorFilter = ColorFilter.tint(tint.provider()),
            modifier = GlanceModifier.size(22.dp),
        )
    }
}

@Composable
fun WidgetIcon(icon: Int, tint: Int, size: Int = 14, description: String? = null) {
    Image(
        provider = ImageProvider(icon),
        contentDescription = description,
        colorFilter = ColorFilter.tint(tint.provider()),
        modifier = GlanceModifier.size(size.dp),
    )
}

/**
 * A centered message, such as "No notes" or "Sign in to Self-Notes". In a widget's column, pass
 * `GlanceModifier.defaultWeight()` so that it takes the height left under the header.
 */
@Composable
fun WidgetMessage(
    text: String,
    colors: WidgetColors,
    modifier: GlanceModifier = GlanceModifier,
    onClick: Action? = null,
    extra: (@Composable () -> Unit)? = null,
) {
    val base = modifier.fillMaxWidth().padding(12.dp)
    Column(
        modifier = if (onClick != null) base.clickable(onClick) else base,
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = text, style = TextStyle(color = colors.text2.provider(), fontSize = 14.sp, textAlign = TextAlign.Center))
        extra?.let {
            Spacer(modifier = GlanceModifier.size(10.dp))
            it()
        }
    }
}

/**
 * The states every widget shares: signed out (WIDGET-9: it only offers to open the app), loading,
 * and nothing to show because the server could not answer. Returns false when the caller should
 * draw its data.
 */
@Composable
fun ColumnScope.showCommonStates(prefs: Preferences, colors: WidgetColors): Boolean {
    val context = LocalContext.current
    val fill = GlanceModifier.defaultWeight()
    when (WidgetStatus.of(prefs)) {
        WidgetStatus.SIGNED_OUT ->
            WidgetMessage(context.getString(R.string.widget_sign_in), colors, fill, onClick = actionStartActivity(WidgetIntents.openApp(context)))
        WidgetStatus.LOADING -> WidgetMessage(context.getString(R.string.widget_loading), colors, fill)
        WidgetStatus.ERROR ->
            WidgetMessage(context.getString(R.string.widget_unreachable), colors, fill, onClick = actionRunCallback<RefreshAction>())
        else -> return false
    }
    return true
}

/** WIDGET-8: offline, the widget keeps its data and says when it was received. */
@Composable
fun StaleFooter(prefs: Preferences, colors: WidgetColors) {
    if (prefs[WidgetKeys.STALE] != true) return
    val updatedAt = prefs[WidgetKeys.UPDATED_AT] ?: return
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Spacer(modifier = GlanceModifier.width(2.dp))
        Text(
            text = context.getString(R.string.widget_offline_since, formatTime(context, updatedAt)),
            maxLines = 1,
            style = TextStyle(color = colors.text2.provider(), fontSize = 11.sp),
        )
    }
}

/** "14:05", or "12 Nov, 14:05" when it was not today. */
fun formatTime(context: Context, ms: Long): String {
    val flags = if (DateUtils.isToday(ms)) {
        DateUtils.FORMAT_SHOW_TIME
    } else {
        DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH
    }
    return DateUtils.formatDateTime(context, ms, flags)
}
