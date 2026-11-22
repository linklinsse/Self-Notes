package app.selfnotes.session

import android.content.Context
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** An access token and its expiry, as the API returns them. */
data class AccessToken(val token: String, val expiresAt: String, val expiresAtMs: Long)

sealed interface TokenResult {
    data class Valid(val access: AccessToken) : TokenResult

    /** No session on this device, or the server rejected it (401): sign in again. */
    data object SignedOut : TokenResult

    /** The server could not be reached. The session is kept (AUTH-4). */
    data object Offline : TokenResult

    /** The server answered with an unexpected status (5xx, 429…). The session is kept. */
    data class Failed(val status: Int) : TokenResult
}

/**
 * The only owner of the session on Android (docs/architecture.md §6.1): server URL, refresh token
 * (encrypted with a Keystore key), and the cached access token. The app (through
 * [SelfNotesNativePlugin]) and the widgets both get their tokens here.
 *
 * Every read or write of the refresh token happens under one [Mutex]. Two callers can never send
 * the same refresh token, so token rotation never looks like theft to the server.
 */
class SessionStore(
    private val storage: SessionStorage,
    private val api: AuthApi,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()

    /** In memory only: after a process restart, the first call refreshes. */
    private var access: AccessToken? = null

    suspend fun serverUrl(): String? = locked { storage.serverUrl }

    /** Switching servers signs out of the previous one (AUTH-7). */
    suspend fun setServerUrl(url: String) = locked {
        if (url != storage.serverUrl) {
            forget()
            storage.serverUrl = url
        }
    }

    /** After login or register. The session belongs to the server it was opened on. */
    suspend fun setSession(serverUrl: String, access: AccessToken, refreshToken: String) = locked {
        storage.serverUrl = serverUrl
        storage.refreshToken = refreshToken
        this.access = access
    }

    /**
     * A valid access token. It is refreshed when it expires within [EARLY_REFRESH_MS], or always
     * with [forceRefresh] (after a 401). Each refresh replaces the refresh token and restarts its
     * 30-day expiry (AUTH-4).
     */
    suspend fun getAccessToken(forceRefresh: Boolean = false): TokenResult = locked {
        val cached = access
        if (!forceRefresh && cached != null && cached.expiresAtMs - now() > EARLY_REFRESH_MS) {
            return@locked TokenResult.Valid(cached)
        }
        val server = storage.serverUrl
        val refreshToken = storage.refreshToken
        if (server == null || refreshToken == null) {
            access = null
            return@locked TokenResult.SignedOut
        }
        when (val result = api.refresh(server, refreshToken)) {
            is RefreshResult.Success -> {
                // The old token is spent: save the new one before anything else can fail.
                storage.refreshToken = result.refreshToken
                access = result.access
                TokenResult.Valid(result.access)
            }
            RefreshResult.Rejected -> {
                forget()
                TokenResult.SignedOut
            }
            RefreshResult.Unreachable -> TokenResult.Offline
            is RefreshResult.Failed -> TokenResult.Failed(result.status)
        }
    }

    /**
     * Forgets the session on this device. With [revoke], also asks the server to revoke it
     * (logout). That call is best effort: being offline never keeps the user signed in.
     */
    suspend fun clearSession(revoke: Boolean) {
        val (server, refreshToken) = locked {
            val pair = storage.serverUrl to storage.refreshToken
            forget()
            pair
        }
        if (revoke && server != null && refreshToken != null) {
            withContext(io) { api.logout(server, refreshToken) }
        }
    }

    private fun forget() {
        access = null
        storage.refreshToken = null
    }

    private suspend fun <T> locked(block: suspend () -> T): T = withContext(io) { mutex.withLock { block() } }

    companion object {
        /** Same margin as the web client (frontend/src/api/session.ts). */
        const val EARLY_REFRESH_MS = 30_000L

        @Volatile private var instance: SessionStore? = null

        /** The process-wide store: one mutex for the app and the widgets. */
        fun get(context: Context): SessionStore =
            instance ?: synchronized(this) {
                instance ?: SessionStore(
                    PrefsSessionStorage(context.applicationContext, KeystoreTokenCipher()),
                    HttpAuthApi(),
                ).also { instance = it }
            }
    }
}
