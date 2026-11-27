package app.selfnotes.widget

import org.json.JSONException
import org.json.JSONObject

/** WIDGET-1, WIDGET-2: which notes a list widget shows. Same values as `GET /notes?scope=`. */
enum class Scope(val api: String, val label: String) {
    MINE("mine", "My notes"),
    SHARED("shared", "Shared with me"),
    ALL("all", "All notes"),
    ;

    companion object {
        fun fromApi(value: String?): Scope = entries.firstOrNull { it.api == value } ?: ALL
    }
}

enum class NoteKind(val api: String, val label: String) {
    TEXT("text", "Text notes"),
    LIST("list", "Lists"),
    ;

    companion object {
        fun fromApi(value: String?): NoteKind? = entries.firstOrNull { it.api == value }
    }
}

/** What a widget shows, chosen when it is placed (and when it is reconfigured). */
sealed interface WidgetConfig {
    /** Notes (WIDGET-1), or Notes by type (WIDGET-2) when [type] is set. */
    data class NotesList(
        val scope: Scope,
        val type: NoteKind? = null,
        val categoryId: String? = null,
        val categoryName: String? = null,
    ) : WidgetConfig {
        /** The widget's header, such as "Lists · Courses". */
        val title: String
            get() = listOfNotNull(type?.label ?: scope.label, categoryName).joinToString(" · ")
    }

    /** Note (WIDGET-3). [hideChecked]: only the items left to do (WIDGET-6). */
    data class Note(val noteId: String, val hideChecked: Boolean = false) : WidgetConfig

    fun toJson(): String =
        when (this) {
            is NotesList -> JSONObject()
                .put("kind", "list")
                .put("scope", scope.api)
                .putOpt("type", type?.api)
                .putOpt("categoryId", categoryId)
                .putOpt("categoryName", categoryName)
            is Note -> JSONObject().put("kind", "note").put("noteId", noteId).put("hideChecked", hideChecked)
        }.toString()

    companion object {
        fun fromJson(json: String?): WidgetConfig? {
            if (json.isNullOrBlank()) return null
            return try {
                val o = JSONObject(json)
                when (o.optString("kind")) {
                    "list" -> NotesList(
                        scope = Scope.fromApi(o.optString("scope")),
                        type = NoteKind.fromApi(o.optString("type").ifEmpty { null }),
                        categoryId = o.optString("categoryId").ifEmpty { null },
                        categoryName = o.optString("categoryName").ifEmpty { null },
                    )
                    "note" -> o.optString("noteId").ifEmpty { null }?.let { Note(it, o.optBoolean("hideChecked")) }
                    else -> null
                }
            } catch (_: JSONException) {
                null
            }
        }
    }
}
