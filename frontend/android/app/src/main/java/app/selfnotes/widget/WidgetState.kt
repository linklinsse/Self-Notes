package app.selfnotes.widget

import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Each placed widget keeps its own Glance state (a small DataStore per widget id): its
 * configuration and the last data received, so it renders at once and still works offline
 * (architecture §6.2). Everything a widget draws comes from this state.
 */
object WidgetKeys {
    /** [WidgetConfig] as JSON. Absent until the configuration screen saves it. */
    val CONFIG = stringPreferencesKey("config")

    /** Last API answer: the `items` array of `GET /notes`, or the note of `GET /notes/{id}`. */
    val DATA = stringPreferencesKey("data")

    val STATUS = stringPreferencesKey("status")

    /** When [DATA] was received (ms). */
    val UPDATED_AT = longPreferencesKey("updatedAt")

    /** The last refresh could not reach the server: [DATA] may be old (WIDGET-8). */
    val STALE = booleanPreferencesKey("stale")

    /** [WidgetColors] as JSON, copied here so that a theme change redraws the widget. */
    val THEME = stringPreferencesKey("theme")
}

enum class WidgetStatus {
    /** Configured, nothing received yet. */
    LOADING,
    OK,

    /** WIDGET-9: "Sign in to Self-Notes". */
    SIGNED_OUT,

    /** WIDGET-11: the note was deleted or is no longer shared. */
    UNAVAILABLE,

    /** Nothing to show and the server could not answer. */
    ERROR,
    ;

    companion object {
        fun of(prefs: Preferences): WidgetStatus =
            prefs[WidgetKeys.STATUS]?.let { name -> entries.firstOrNull { it.name == name } } ?: LOADING
    }
}

/** One row of a list widget (WIDGET-4), from a `NoteSummary`. */
data class NoteRow(
    val id: String,
    val title: String,
    val preview: String,
    val isList: Boolean,
    val locked: Boolean,
    val pinned: Boolean,
    val categoryColors: List<Int>,
    val checked: Int?,
    val total: Int?,
) {
    companion object {
        fun parseAll(json: String?): List<NoteRow> {
            if (json.isNullOrBlank()) return emptyList()
            return try {
                val array = JSONArray(json)
                (0 until array.length()).mapNotNull { i -> array.optJSONObject(i)?.let(::parse) }
            } catch (_: JSONException) {
                emptyList()
            }
        }

        private fun parse(o: JSONObject): NoteRow? {
            val id = o.optString("id").ifEmpty { return null }
            val preview = o.optString("preview")
            val items = o.optJSONObject("items")
            val categories = o.optJSONArray("categories") ?: JSONArray()
            return NoteRow(
                id = id,
                // WIDGET-4: the first line stands in for a missing title.
                title = o.optString("title").trim().ifEmpty { preview.lineSequence().firstOrNull()?.trim().orEmpty() },
                preview = preview,
                isList = o.optString("type") == "list",
                locked = o.optBoolean("locked"),
                pinned = o.optBoolean("pinned"),
                categoryColors = (0 until categories.length()).mapNotNull { i ->
                    categories.optJSONObject(i)?.optString("color")?.let(CssColor::parse)
                },
                checked = items?.optInt("checked"),
                total = items?.optInt("total"),
            )
        }
    }
}

data class WidgetCategory(val name: String, val color: Int)

/** The note shown by a Note widget, from `GET /notes/{id}`. */
data class NoteView(
    val id: String,
    val title: String,
    val isList: Boolean,
    val content: String,
    val locked: Boolean,
    /** The reader's own categories on the note (CAT-4). */
    val categories: List<WidgetCategory>,
    /** WIDGET-6: owners and editors check items from the widget; viewers only see them. */
    val canEdit: Boolean,
) {
    companion object {
        fun parse(json: String?): NoteView? {
            if (json.isNullOrBlank()) return null
            return try {
                val o = JSONObject(json)
                val categories = o.optJSONArray("categories") ?: JSONArray()
                val role = o.optString("role")
                NoteView(
                    id = o.getString("id"),
                    title = o.optString("title").trim(),
                    isList = o.optString("type") == "list",
                    content = o.optString("content"),
                    locked = o.optBoolean("locked"),
                    categories = (0 until categories.length()).mapNotNull { i ->
                        val category = categories.optJSONObject(i) ?: return@mapNotNull null
                        CssColor.parse(category.optString("color"))?.let { WidgetCategory(category.optString("name"), it) }
                    },
                    canEdit = role == "owner" || role == "editor",
                )
            } catch (_: JSONException) {
                null
            }
        }
    }
}
