package app.selfnotes.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.state.PreferencesGlanceStateDefinition
import app.selfnotes.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONException
import org.json.JSONObject

/** The refresh button (WIDGET-7). */
class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val widget = WidgetUpdater.widgetOf(context, glanceId) ?: return
        WidgetUpdater.refresh(context, widget, glanceId)
    }
}

/**
 * WIDGET-6: checks or unchecks an item of the note shown by a Note widget, from its box only (the
 * rest of the line opens the note). The widget changes at once; then `POST /notes/{id}/items/toggle` saves it and the widget redraws from the answer. If
 * the server cannot save it, the item goes back to how it was.
 */
class ToggleItemAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val index = parameters[INDEX] ?: return
        val text = parameters[TEXT] ?: return
        val checked = parameters[CHECKED] ?: return
        val widget: GlanceAppWidget = WidgetUpdater.widgetOf(context, glanceId) ?: NoteWidget()
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId)
        val config = WidgetConfig.fromJson(prefs[WidgetKeys.CONFIG]) as? WidgetConfig.Note ?: return
        val before = prefs[WidgetKeys.DATA] ?: return

        optimistic(before, index, checked)?.let { after ->
            updateAppWidgetState(context, glanceId) { it[WidgetKeys.DATA] = after }
            widget.update(context, glanceId)
        }

        when (val result = WidgetApi(SessionStore.get(context)).toggleItem(config.noteId, index, text, checked)) {
            is ApiResult.Ok -> {
                WidgetUpdater.store(context, glanceId, ApiResult.Ok(result.value.toString()))
                // Other widgets may show this note too (list progress, another Note widget).
                WidgetUpdater.requestRefresh(context, delayMs = 2_000)
            }
            ApiResult.SignedOut, ApiResult.NotFound -> WidgetUpdater.store(context, glanceId, result.map { "" })
            else -> {
                updateAppWidgetState(context, glanceId) { it[WidgetKeys.DATA] = before }
                // The note changed meanwhile (item moved or gone): show it as it is now.
                if (result is ApiResult.Conflict) {
                    WidgetUpdater.refresh(context, widget, glanceId)
                    return
                }
                if (result is ApiResult.Offline) WidgetUpdater.store(context, glanceId, result.map { "" })
            }
        }
        widget.update(context, glanceId)
    }

    /** The note JSON with the item already changed, or null when the item is not found locally. */
    private fun optimistic(noteJson: String, index: Int, checked: Boolean): String? =
        try {
            val note = JSONObject(noteJson)
            WidgetMarkdown.setChecked(note.optString("content"), index, checked)?.let { note.put("content", it).toString() }
        } catch (_: JSONException) {
            null
        }

    companion object {
        val INDEX = ActionParameters.Key<Int>("index")
        val TEXT = ActionParameters.Key<String>("text")
        val CHECKED = ActionParameters.Key<Boolean>("checked")
    }
}

/** WIDGET-6: the header button of a Note widget that hides or shows the checked items. */
class ToggleHideCheckedAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val widget: GlanceAppWidget = WidgetUpdater.widgetOf(context, glanceId) ?: NoteWidget()
        updateAppWidgetState(context, glanceId) { prefs ->
            val config = WidgetConfig.fromJson(prefs[WidgetKeys.CONFIG]) as? WidgetConfig.Note
            if (config != null) prefs[WidgetKeys.CONFIG] = config.copy(hideChecked = !config.hideChecked).toJson()
        }
        widget.update(context, glanceId)
    }
}

/**
 * Starts the 15-minute refresh with the first widget, and stops it with the last one
 * (WIDGET-8). Glance deletes a widget's state when the widget is removed.
 */
abstract class SelfNotesWidgetReceiver : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetUpdater.schedulePeriodic(context)
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetUpdater.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                WidgetUpdater.stopIfNoWidgets(context)
            } finally {
                pending.finish()
            }
        }
    }
}

class NotesListWidgetReceiver : SelfNotesWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotesListWidget()
}

class NotesByTypeWidgetReceiver : SelfNotesWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotesByTypeWidget()
}

class NoteWidgetReceiver : SelfNotesWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NoteWidget()
}
