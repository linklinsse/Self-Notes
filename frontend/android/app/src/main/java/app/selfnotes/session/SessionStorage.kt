package app.selfnotes.session

import android.content.Context
import androidx.core.content.edit

/** Persistent part of the session. Implementations may block: [SessionStore] calls them on its IO dispatcher. */
interface SessionStorage {
    var serverUrl: String?

    /** Stored encrypted. Null when there is none, or when it can no longer be decrypted. */
    var refreshToken: String?
}

/**
 * SharedPreferences, written with commit() rather than apply(): a rotated refresh token must be on
 * disk before it is used, or a process kill could bring back a spent token (and a sign-out).
 */
class PrefsSessionStorage(context: Context, private val cipher: TokenCipher) : SessionStorage {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit(commit = true) {
            if (value == null) remove(KEY_SERVER_URL) else putString(KEY_SERVER_URL, value)
        }

    override var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)?.let(cipher::decrypt)
        set(value) = prefs.edit(commit = true) {
            if (value == null) remove(KEY_REFRESH_TOKEN) else putString(KEY_REFRESH_TOKEN, cipher.encrypt(value))
        }

    private companion object {
        const val PREFS_NAME = "selfnotes.session"
        const val KEY_SERVER_URL = "serverUrl"
        const val KEY_REFRESH_TOKEN = "refreshToken"
    }
}
