package app.selfnotes.widget

import app.selfnotes.session.SessionStore
import app.selfnotes.session.TokenResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** The outcome of an API call made by a widget. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>

    /** No session on this device, or the server ended it (WIDGET-9). */
    data object SignedOut : ApiResult<Nothing>

    /** 403 or 404: the note was deleted or is no longer shared with the user (WIDGET-11). */
    data object NotFound : ApiResult<Nothing>

    /** The server cannot be reached: widgets keep their last data (WIDGET-8). */
    data object Offline : ApiResult<Nothing>

    data class Failed(val status: Int) : ApiResult<Nothing>
}

fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> =
    when (this) {
        is ApiResult.Ok -> ApiResult.Ok(transform(value))
        is ApiResult.SignedOut -> this
        is ApiResult.NotFound -> this
        is ApiResult.Offline -> this
        is ApiResult.Failed -> this
    }

/** One GET. Throws IOException when there is no answer. Blocking. */
fun interface HttpClient {
    fun get(url: String, accessToken: String): Pair<Int, String>
}

/**
 * The few endpoints the widgets read (docs/api.md), with an access token from [SessionStore]: the
 * same session as the app, refreshed under the same mutex (architecture §6.1). Each refresh of the
 * session extends it for 30 days, so widgets keep the phone signed in (AUTH-4, WIDGET-9).
 */
class WidgetApi(
    private val store: SessionStore,
    private val http: HttpClient = UrlConnectionClient(),
) {
    /** WIDGET-4: favorites first, then the most recently updated, up to [limit] notes. */
    suspend fun listNotes(
        config: WidgetConfig.NotesList,
        limit: Int = 50,
        query: String? = null,
        sort: String = "favorites",
    ): ApiResult<JSONArray> {
        val params = buildList {
            add("scope" to config.scope.api)
            config.type?.let { add("type" to it.api) }
            config.categoryId?.let { add("category" to it) }
            query?.takeIf { it.isNotBlank() }?.let { add("q" to it.trim()) }
            add("sort" to sort)
            add("limit" to limit.toString())
        }
        val queryString = params.joinToString("&") { (k, v) -> "$k=${URLEncoder.encode(v, "UTF-8")}" }
        return call("/api/v1/notes?$queryString").json { JSONObject(it).getJSONArray("items") }
    }

    suspend fun getNote(noteId: String): ApiResult<JSONObject> =
        call("/api/v1/notes/${URLEncoder.encode(noteId, "UTF-8")}").json(::JSONObject)

    /** The user's categories, for the list widgets' configuration. */
    suspend fun categories(): ApiResult<JSONArray> = call("/api/v1/categories").json(::JSONArray)

    private suspend fun call(path: String): ApiResult<String> {
        val server = store.serverUrl() ?: return ApiResult.SignedOut
        for (attempt in 0..1) {
            val token = when (val result = store.getAccessToken(forceRefresh = attempt == 1)) {
                is TokenResult.Valid -> result.access.token
                TokenResult.SignedOut -> return ApiResult.SignedOut
                TokenResult.Offline -> return ApiResult.Offline
                is TokenResult.Failed -> return ApiResult.Failed(result.status)
            }
            val (status, text) =
                try {
                    withContext(Dispatchers.IO) { http.get("$server$path", token) }
                } catch (_: IOException) {
                    return ApiResult.Offline
                }
            when (status) {
                in 200..299 -> return ApiResult.Ok(text)
                // The access token was refused: refresh it once (the session itself may still be fine).
                401 -> if (attempt == 1) return ApiResult.Failed(401)
                403, 404 -> return ApiResult.NotFound
                else -> return ApiResult.Failed(status)
            }
        }
        return ApiResult.Failed(401)
    }

    private fun <T> ApiResult<String>.json(parse: (String) -> T): ApiResult<T> =
        when (this) {
            is ApiResult.Ok ->
                try {
                    ApiResult.Ok(parse(value))
                } catch (_: JSONException) {
                    ApiResult.Failed(200)
                }
            else -> map { error("unreachable") }
        }
}

/** HttpURLConnection, like the session's auth calls. */
class UrlConnectionClient(private val timeoutMs: Int = 15_000) : HttpClient {
    override fun get(url: String, accessToken: String): Pair<Int, String> {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $accessToken")
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            return status to (stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "")
        } finally {
            connection.disconnect()
        }
    }
}
