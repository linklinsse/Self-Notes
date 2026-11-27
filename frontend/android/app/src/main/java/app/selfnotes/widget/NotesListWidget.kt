package app.selfnotes.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.selfnotes.R

/**
 * Notes (WIDGET-1), and Notes by type (WIDGET-2) through [NotesByTypeWidget]: a scrollable list of
 * notes, favorites first then the most recently updated, up to 50 (WIDGET-4).
 */
open class NotesListWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { NotesListContent(currentState()) }
    }
}

/** Same widget; its configuration also sets a type (WIDGET-2). A separate class per receiver. */
class NotesByTypeWidget : NotesListWidget()

@Composable
fun NotesListContent(prefs: Preferences) {
    val context = LocalContext.current
    val colors = colorsOf(context, prefs)
    val config = WidgetConfig.fromJson(prefs[WidgetKeys.CONFIG]) as? WidgetConfig.NotesList
    WidgetFrame(colors) {
        WidgetHeader(
            title = config?.title ?: context.getString(R.string.app_name),
            colors = colors,
            onTitle = actionStartActivity(WidgetIntents.openApp(context)),
            // WIDGET-7: a new note of the widget's type (text for the plain Notes widget).
            newNote = actionStartActivity(WidgetIntents.newNote(context, config?.type ?: NoteKind.TEXT)),
        )
        StaleNotice(prefs, colors)
        if (!showCommonStates(prefs, colors)) {
            val rows = NoteRow.parseAll(prefs[WidgetKeys.DATA])
            if (rows.isEmpty()) {
                WidgetMessage(context.getString(R.string.widget_no_notes), colors, GlanceModifier.defaultWeight())
            } else {
                LazyColumn(modifier = GlanceModifier.defaultWeight()) {
                    items(rows, itemId = { it.id.hashCode().toLong() }) { row -> NoteRowView(row, colors) }
                }
            }
        }
    }
}

/** WIDGET-4: title, preview, category colors, type icon, and progress for lists. */
@Composable
private fun NoteRowView(row: NoteRow, colors: WidgetColors) {
    val context = LocalContext.current
    Column(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Column(
            modifier = GlanceModifier
                .fillMaxWidth()
                .rounded(colors.card, 12)
                .padding(horizontal = 10.dp, vertical = 8.dp)
                .clickable(actionStartActivity(WidgetIntents.openNote(context, row.id))),
        ) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                WidgetIcon(if (row.isList) R.drawable.ic_widget_list else R.drawable.ic_widget_text, colors.text2)
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = row.title.ifEmpty { context.getString(R.string.widget_untitled) },
                    maxLines = 1,
                    style = TextStyle(color = colors.text1.provider(), fontSize = 14.sp, fontWeight = FontWeight.Medium),
                    modifier = GlanceModifier.defaultWeight(),
                )
                if (row.locked) {
                    Spacer(modifier = GlanceModifier.width(4.dp))
                    WidgetIcon(R.drawable.ic_widget_lock, colors.text2, description = context.getString(R.string.widget_locked_short))
                }
                if (row.pinned) {
                    Spacer(modifier = GlanceModifier.width(4.dp))
                    WidgetIcon(R.drawable.ic_widget_star, colors.accent, description = context.getString(R.string.widget_favorite))
                }
            }
            // NOTE-17: a locked note shows its title only.
            if (!row.locked && row.preview.isNotBlank()) {
                Text(
                    text = row.preview,
                    maxLines = 2,
                    style = TextStyle(color = colors.text2.provider(), fontSize = 12.sp),
                    modifier = GlanceModifier.padding(top = 3.dp),
                )
            }
            if (row.categoryColors.isNotEmpty() || row.total != null) {
                Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    // A row of its own: Glance drops the children of a row after the 10th.
                    Row(modifier = GlanceModifier.defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
                        row.categoryColors.take(5).forEach { color ->
                            WidgetIcon(R.drawable.ic_widget_dot, color, size = 9)
                            Spacer(modifier = GlanceModifier.width(4.dp))
                        }
                    }
                    if (row.total != null && row.total > 0) {
                        Text(
                            text = "${row.checked ?: 0}/${row.total}",
                            style = TextStyle(color = colors.text2.provider(), fontSize = 12.sp),
                        )
                    }
                }
            }
        }
    }
}
