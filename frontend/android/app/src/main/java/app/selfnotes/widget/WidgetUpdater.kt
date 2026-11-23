package app.selfnotes.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.selfnotes.session.SessionStore
import java.util.concurrent.TimeUnit

/**
 * Fetches widget data and redraws widgets (architecture §6.2, WIDGET-8): every 30 minutes while
 * online, on demand from the app (`refreshWidgets`, sign-in and sign-out), and from each widget's
 * refresh button.
 */
object WidgetUpdater {
    private const val PERIODIC_WORK = "selfnotes.widgets.periodic"
    private const val NOW_WORK = "selfnotes.widgets.now"

    /** WIDGET-8. WorkManager's minimum period is 15 minutes. */
    private const val PERIOD_MINUTES = 30L

    /** The widget behind each receiver. */
    private fun widgetFor(receiverClassName: String?): GlanceAppWidget? =
        when (receiverClassName) {
            NotesListWidgetReceiver::class.java.name -> NotesListWidget()
            NotesByTypeWidgetReceiver::class.java.name -> NotesByTypeWidget()
            NoteWidgetReceiver::class.java.name -> NoteWidget()
            else -> null
        }

    private val allWidgets: List<GlanceAppWidget>
        get() = listOf(NotesListWidget(), NotesByTypeWidget(), NoteWidget())

    suspend fun widgetIds(context: Context): List<Pair<GlanceAppWidget, GlanceId>> {
        val manager = GlanceAppWidgetManager(context)
        return allWidgets.flatMap { widget -> manager.getGlanceIds(widget.javaClass).map { widget to it } }
    }

    /** The widget class of a placed widget, from the receiver Android knows it by. */
    fun widgetOf(context: Context, glanceId: GlanceId): GlanceAppWidget? {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(glanceId)
        val info = AppWidgetManager.getInstance(context).getAppWidgetInfo(appWidgetId) ?: return null
        return widgetFor(info.provider.className)
    }

    suspend fun refreshAll(context: Context) {
        for ((widget, id) in widgetIds(context)) refresh(context, widget, id)
    }

    /** Fetches the data of one widget, saves it in the widget's state and redraws it. */
    suspend fun refresh(context: Context, widget: GlanceAppWidget, glanceId: GlanceId) {
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId)
        val config = WidgetConfig.fromJson(prefs[WidgetKeys.CONFIG]) ?: return // not configured yet
        val api = WidgetApi(SessionStore.get(context))
        val result: ApiResult<String> =
            when (config) {
                is WidgetConfig.NotesList -> api.listNotes(config).map { it.toString() }
                is WidgetConfig.Note -> api.getNote(config.noteId).map { it.toString() }
            }
        store(context, glanceId, result)
        widget.update(context, glanceId)
    }

    /** Saves the outcome of a fetch in the widget's state. */
    suspend fun store(context: Context, glanceId: GlanceId, result: ApiResult<String>) {
        val theme = WidgetTheme.load(context).toJson()
        updateAppWidgetState(context, glanceId) { prefs -> apply(prefs, result, theme, System.currentTimeMillis()) }
    }

    /** Visible for tests: how each outcome changes a widget's state. */
    fun apply(prefs: MutablePreferences, result: ApiResult<String>, theme: String, now: Long) {
        prefs[WidgetKeys.THEME] = theme
        when (result) {
            is ApiResult.Ok -> {
                prefs[WidgetKeys.DATA] = result.value
                prefs[WidgetKeys.STATUS] = WidgetStatus.OK.name
                prefs[WidgetKeys.UPDATED_AT] = now
                prefs[WidgetKeys.STALE] = false
            }
            // Signed out: nothing of the account stays on the home screen.
            ApiResult.SignedOut -> {
                prefs.remove(WidgetKeys.DATA)
                prefs.remove(WidgetKeys.UPDATED_AT)
                prefs[WidgetKeys.STATUS] = WidgetStatus.SIGNED_OUT.name
                prefs[WidgetKeys.STALE] = false
            }
            ApiResult.NotFound -> {
                prefs.remove(WidgetKeys.DATA)
                prefs.remove(WidgetKeys.UPDATED_AT)
                prefs[WidgetKeys.STATUS] = WidgetStatus.UNAVAILABLE.name
                prefs[WidgetKeys.STALE] = false
            }
            // Offline or a server error: keep showing the last data, marked as old.
            else -> {
                prefs[WidgetKeys.STALE] = true
                if (prefs[WidgetKeys.DATA] == null) prefs[WidgetKeys.STATUS] = WidgetStatus.ERROR.name
            }
        }
    }

    /** WIDGET-10: redraws every widget with the current theme, without any network call. */
    suspend fun applyTheme(context: Context) {
        val theme = WidgetTheme.load(context).toJson()
        for ((widget, id) in widgetIds(context)) {
            updateAppWidgetState(context, id) { it[WidgetKeys.THEME] = theme }
            widget.update(context, id)
        }
    }

    /**
     * Refreshes every widget soon. Calls within [delayMs] replace each other, so that autosaving
     * while typing does not refresh the widgets every second.
     */
    fun requestRefresh(context: Context, delayMs: Long = 0) {
        val request = OneTimeWorkRequestBuilder<WidgetRefreshWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW_WORK, ExistingWorkPolicy.REPLACE, request)
    }

    /** Starts the 30-minute refresh while at least one widget exists. */
    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(PERIOD_MINUTES, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Called when the last widget of a kind is removed: stops the refresh if none is left at all. */
    suspend fun stopIfNoWidgets(context: Context) {
        if (widgetIds(context).isEmpty()) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
        }
    }
}

/** The periodic and on-demand refresh of every widget. */
class WidgetRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        WidgetUpdater.refreshAll(applicationContext)
        return Result.success()
    }
}
