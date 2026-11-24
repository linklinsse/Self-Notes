package app.selfnotes.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** The refresh button (WIDGET-7). */
class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val widget = WidgetUpdater.widgetOf(context, glanceId) ?: return
        WidgetUpdater.refresh(context, widget, glanceId)
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
