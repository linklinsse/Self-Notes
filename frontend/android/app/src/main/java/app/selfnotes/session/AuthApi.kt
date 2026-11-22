package app.selfnotes.session

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

sealed interface RefreshResult {
    data class Success(val access: AccessToken, val refreshToken: String) : RefreshResult

    /** 401: the refresh token is unknown, expired or revoked. */
    data object Rejected : RefreshResult

    /** No answer (no network, DNS, TLS, timeout). */
    data object Unreachable : RefreshResult

    data class Failed(val status: Int) : RefreshResult
}

/** The two auth endpoints the native layer calls itself (docs/api.md, "Auth"). Blocking calls. */
interface AuthApi {
    fun refresh(serverUrl: String, refreshToken: String): RefreshResult

    /** Best effort: never throws. */
    fun logout(serverUrl: String, refreshToken: String)
}

/** HttpURLConnection client, always with the body token transport. */
class HttpAuthApi(
    private val timeoutMs: Int = 15_000,
    private val now: () -> Long = System::currentTimeMillis,
) : AuthApi {

    override fun refresh(serverUrl: String, refreshToken: String): RefreshResult {
        val (status, body) =
            try {
                post("$serverUrl/api/v1/auth/refresh", refreshToken)
            } catch (_: IOException) {
                return RefreshResult.Unreachable
            }
        return when (status) {
            200 -> parseTokens(body) ?: RefreshResult.Failed(status)
            401 -> RefreshResult.Rejected
            else -> RefreshResult.Failed(status)
        }
    }

    override fun logout(serverUrl: String, refreshToken: String) {
        try {
            post("$serverUrl/api/v1/auth/logout", refreshToken)
        } catch (_: IOException) {
            // offline: the session is forgotten on the device anyway
        }
    }

    private fun parseTokens(body: String): RefreshResult.Success? =
        try {
            val json = JSONObject(body)
            val expiresAt = json.getString("accessTokenExpiresAt")
            RefreshResult.Success(
                access = AccessToken(
                    token = json.getString("accessToken"),
                    expiresAt = expiresAt,
                    // Unreadable date: keep the token one minute rather than refreshing on every call.
                    expiresAtMs = IsoTime.parseMillis(expiresAt) ?: (now() + 60_000L),
                ),
                refreshToken = json.getString("refreshToken"),
            )
        } catch (_: JSONException) {
            null
        }

    private fun post(url: String, refreshToken: String): Pair<Int, String> {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-Token-Transport", "body")
            val payload = JSONObject().put("refreshToken", refreshToken).toString()
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return status to body
        } finally {
            connection.disconnect()
        }
    }
}

/** ISO-8601 instants as written by JavaScript's Date.toISOString() (java.time needs API 26). */
object IsoTime {
    private val patterns = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX")

    fun parseMillis(value: String): Long? {
        for (pattern in patterns) {
            val format = SimpleDateFormat(pattern, Locale.US).apply {
                isLenient = false
                timeZone = TimeZone.getTimeZone("UTC")
            }
            try {
                return format.parse(value)?.time
            } catch (_: ParseException) {
                // try the next pattern
            }
        }
        return null
    }
}
