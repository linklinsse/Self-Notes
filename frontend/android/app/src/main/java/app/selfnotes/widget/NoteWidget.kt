package app.selfnotes.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.datastore.preferences.core.Preferences
import androidx.glance.Button
import androidx.glance.ButtonDefaults
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalGlanceId
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import app.selfnotes.R

/** Note (WIDGET-3): the content of one note, as simplified Markdown (WIDGET-5). */
class NoteWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { NoteContent(currentState()) }
    }
}

@Composable
fun NoteContent(prefs: Preferences) {
    val context = LocalContext.current
    val colors = colorsOf(context, prefs)
    val config = WidgetConfig.fromJson(prefs[WidgetKeys.CONFIG]) as? WidgetConfig.Note
    val note = NoteView.parse(prefs[WidgetKeys.DATA])
    val status = WidgetStatus.of(prefs)
    val open = config?.let { actionStartActivity(WidgetIntents.openNote(context, it.noteId)) }
        ?: actionStartActivity(WidgetIntents.openApp(context))
    // The note's data may outlive a status change (signed out, unavailable): show it only when OK.
    val shown = note.takeIf { status == WidgetStatus.OK }
    WidgetFrame(colors, accent = shown?.categories?.firstOrNull()?.color) {
        WidgetHeader(
            title = when {
                shown == null -> context.getString(R.string.app_name)
                else -> shown.title.ifEmpty { context.getString(R.string.widget_untitled) }
            },
            colors = colors,
            onTitle = open,
            newNote = null,
        )
        if (status == WidgetStatus.UNAVAILABLE) {
            UnavailableMessage(colors)
        } else if (!showCommonStates(prefs, colors)) {
            when {
                shown == null -> WidgetMessage(context.getString(R.string.widget_loading), colors, GlanceModifier.defaultWeight())
                // NOTE-17: never the content of a locked note, only its title and categories.
                shown.locked -> {
                    CategoryChips(shown.categories)
                    WidgetMessage(context.getString(R.string.widget_locked), colors, GlanceModifier.defaultWeight(), onClick = open)
                }
                else -> NoteBlocks(shown, colors, open)
            }
        }
        StaleFooter(prefs, colors)
    }
}

/** WIDGET-6: every block opens the note. Items are checked in the app, not here. */
@Composable
private fun ColumnScope.NoteBlocks(note: NoteView, colors: WidgetColors, open: Action) {
    val context = LocalContext.current
    val parsed = WidgetMarkdown.parse(note.content)
    if (parsed.blocks.isEmpty()) {
        CategoryChips(note.categories)
        WidgetMessage(context.getString(R.string.widget_empty_note), colors, GlanceModifier.defaultWeight(), onClick = open)
        return
    }
    LazyColumn(modifier = GlanceModifier.defaultWeight()) {
        // The chips scroll with the content: on a small widget the height goes to the note.
        if (note.categories.isNotEmpty()) {
            item { Box(modifier = GlanceModifier.fillMaxWidth().clickable(open)) { CategoryChips(note.categories) } }
        }
        items(parsed.blocks) { block ->
            Box(modifier = GlanceModifier.fillMaxWidth().clickable(open)) { BlockView(block, colors) }
        }
        if (parsed.truncated) {
            item {
                Text(
                    text = context.getString(R.string.widget_more),
                    style = TextStyle(color = colors.accent.provider(), fontSize = 13.sp),
                    modifier = GlanceModifier.padding(vertical = 6.dp).clickable(open),
                )
            }
        }
    }
}

/** WIDGET-5: block structure kept, inline formatting as plain text. */
@Composable
private fun BlockView(block: WidgetBlock, colors: WidgetColors) {
    val text1 = colors.text1.provider()
    val text2 = colors.text2.provider()
    when (block) {
        is WidgetBlock.Heading -> Text(
            text = block.text,
            style = TextStyle(
                color = text1,
                fontWeight = FontWeight.Bold,
                fontSize = when (block.level) {
                    1 -> 18.sp
                    2 -> 16.sp
                    else -> 15.sp
                },
            ),
            modifier = GlanceModifier.padding(top = 6.dp, bottom = 2.dp),
        )
        is WidgetBlock.Paragraph -> Text(
            text = block.text,
            style = TextStyle(color = text1, fontSize = 14.sp),
            modifier = GlanceModifier.padding(vertical = 2.dp),
        )
        is WidgetBlock.ListItem -> Row(modifier = GlanceModifier.fillMaxWidth().padding(start = (block.depth * 14).dp, top = 1.dp, bottom = 1.dp)) {
            Text(text = block.marker, style = TextStyle(color = colors.accent.provider(), fontSize = 14.sp))
            Spacer(modifier = GlanceModifier.width(6.dp))
            Text(text = block.text, style = TextStyle(color = text1, fontSize = 14.sp))
        }
        is WidgetBlock.Task -> TaskView(block, colors)
        is WidgetBlock.Code -> Box(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp)) {
            Text(
                text = block.text,
                style = TextStyle(color = text1, fontSize = 12.sp, fontFamily = FontFamily.Monospace),
                modifier = GlanceModifier.fillMaxWidth().rounded(colors.codeBg, 8).padding(8.dp),
            )
        }
        is WidgetBlock.Quote -> Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Box(modifier = GlanceModifier.width(3.dp).height(18.dp).background(colors.accent.provider())) {}
            Spacer(modifier = GlanceModifier.width(8.dp))
            Text(text = block.text, style = TextStyle(color = text2, fontSize = 14.sp, fontStyle = FontStyle.Italic))
        }
        WidgetBlock.Rule -> Box(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Box(modifier = GlanceModifier.fillMaxWidth().height(1.dp).background(colors.border.provider())) {}
        }
    }
}

/**
 * WIDGET-6: a small box shows the state, and checked items are struck through. An image rather than
 * a CheckBox: it cannot be toggled, and Android 12+ gives every CheckBox a height of 48 dp.
 */
@Composable
private fun TaskView(task: WidgetBlock.Task, colors: WidgetColors) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(start = (task.depth * 12).dp, top = 1.dp, bottom = 1.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WidgetIcon(
            icon = if (task.checked) R.drawable.ic_widget_checked else R.drawable.ic_widget_unchecked,
            tint = if (task.checked) colors.checkbox else colors.text2,
            size = 13,
            description = context.getString(if (task.checked) R.string.widget_checked else R.string.widget_unchecked),
        )
        Spacer(modifier = GlanceModifier.width(6.dp))
        Text(
            text = task.text,
            maxLines = 3,
            style = TextStyle(
                color = (if (task.checked) colors.text2 else colors.text1).provider(),
                fontSize = 13.sp,
                textDecoration = if (task.checked) TextDecoration.LineThrough else TextDecoration.None,
            ),
        )
    }
}

/** WIDGET-11: the note was deleted or is no longer shared. */
@Composable
private fun ColumnScope.UnavailableMessage(colors: WidgetColors) {
    val context = LocalContext.current
    val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(LocalGlanceId.current)
    val pick = Intent(context, NoteConfigActivity::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        // One pending intent per widget.
        .setData("selfnotes-widget://configure/$appWidgetId".toUri())
    WidgetMessage(context.getString(R.string.widget_unavailable), colors, GlanceModifier.defaultWeight()) {
        Button(
            text = context.getString(R.string.widget_pick_note),
            onClick = actionStartActivity(pick),
            colors = ButtonDefaults.buttonColors(backgroundColor = colors.accentFill.provider(), contentColor = colors.onAccentFill.provider()),
        )
    }
}
