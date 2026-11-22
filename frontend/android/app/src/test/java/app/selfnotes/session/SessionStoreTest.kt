package app.selfnotes.session

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

private const val SERVER = "https://notes.example.com"
private const val NOW = 1_000_000_000L

private class MemoryStorage(
    override var serverUrl: String? = null,
    override var refreshToken: String? = null,
) : SessionStorage

/** Rotates tokens like the server: each refresh token works once. */
private class FakeAuthApi : AuthApi {
    val refreshCalls = AtomicInteger()
    val logouts = mutableListOf<String>()
    var next: (String) -> RefreshResult = { used ->
        val n = refreshCalls.get()
        RefreshResult.Success(access("access-$n"), "refresh-$n").also { spent += used }
    }
    val spent = mutableListOf<String>()

    override fun refresh(serverUrl: String, refreshToken: String): RefreshResult {
        refreshCalls.incrementAndGet()
        Thread.sleep(5) // widen the race window for the concurrency test
        return next(refreshToken)
    }

    override fun logout(serverUrl: String, refreshToken: String) {
        logouts += refreshToken
    }
}

private fun access(token: String, expiresAtMs: Long = NOW + 15 * 60_000L) =
    AccessToken(token, "2026-01-01T00:15:00.000Z", expiresAtMs)

private fun store(storage: SessionStorage, api: AuthApi) =
    SessionStore(storage, api, io = Dispatchers.Default, now = { NOW })

class SessionStoreTest {

    @Test
    fun `AUTH-4 returns the cached access token while it is valid`() = runTest {
        val api = FakeAuthApi()
        val store = store(MemoryStorage(), api)
        store.setSession(SERVER, access("a1"), "r1")

        val result = store.getAccessToken()

        assertEquals(TokenResult.Valid(access("a1")), result)
        assertEquals(0, api.refreshCalls.get())
    }

    @Test
    fun `AUTH-4 refreshes an expiring token and stores the rotated refresh token`() = runTest {
        val api = FakeAuthApi()
        val storage = MemoryStorage()
        val store = store(storage, api)
        store.setSession(SERVER, access("a0", expiresAtMs = NOW + 10_000L), "r0")

        val result = store.getAccessToken()

        assertEquals("access-1", (result as TokenResult.Valid).access.token)
        assertEquals("refresh-1", storage.refreshToken)
        assertEquals(listOf("r0"), api.spent)
    }

    @Test
    fun `AUTH-4 concurrent callers share one refresh (single mutex, no token reuse)`() = runTest {
        val api = FakeAuthApi()
        val store = store(MemoryStorage(SERVER, "r0"), api)

        val results = (1..20).map { async(Dispatchers.Default) { store.getAccessToken() } }.awaitAll()

        assertEquals(1, api.refreshCalls.get())
        assertEquals(setOf(TokenResult.Valid(access("access-1"))), results.toSet())
    }

    @Test
    fun `AUTH-4 forced refreshes run one after the other, each with the latest token`() = runTest {
        val api = FakeAuthApi()
        val storage = MemoryStorage(SERVER, "r0")
        val store = store(storage, api)

        (1..5).map { async(Dispatchers.Default) { store.getAccessToken(forceRefresh = true) } }.awaitAll()

        assertEquals(5, api.refreshCalls.get())
        assertEquals(listOf("r0", "refresh-1", "refresh-2", "refresh-3", "refresh-4"), api.spent)
        assertEquals("refresh-5", storage.refreshToken)
    }

    @Test
    fun `AUTH-4 a rejected refresh signs out`() = runTest {
        val api = FakeAuthApi().apply { next = { RefreshResult.Rejected } }
        val storage = MemoryStorage(SERVER, "r0")
        val store = store(storage, api)

        assertEquals(TokenResult.SignedOut, store.getAccessToken())
        assertNull(storage.refreshToken)
        assertEquals(SERVER, storage.serverUrl)
    }

    @Test
    fun `AUTH-4 network errors and server errors keep the session`() = runTest {
        val api = FakeAuthApi().apply { next = { RefreshResult.Unreachable } }
        val storage = MemoryStorage(SERVER, "r0")
        val store = store(storage, api)

        assertEquals(TokenResult.Offline, store.getAccessToken())
        api.next = { RefreshResult.Failed(503) }
        assertEquals(TokenResult.Failed(503), store.getAccessToken())
        assertEquals("r0", storage.refreshToken)
    }

    @Test
    fun `without a session, no request is made`() = runTest {
        val api = FakeAuthApi()
        val store = store(MemoryStorage(SERVER, null), api)

        assertEquals(TokenResult.SignedOut, store.getAccessToken())
        assertEquals(0, api.refreshCalls.get())
    }

    @Test
    fun `AUTH-7 switching servers ends the session, the same server keeps it`() = runTest {
        val storage = MemoryStorage()
        val store = store(storage, FakeAuthApi())
        store.setSession(SERVER, access("a1"), "r1")

        store.setServerUrl(SERVER)
        assertEquals("r1", storage.refreshToken)

        store.setServerUrl("https://other.example.com")
        assertNull(storage.refreshToken)
        assertEquals("https://other.example.com", storage.serverUrl)
        assertEquals(TokenResult.SignedOut, store.getAccessToken())
    }

    @Test
    fun `logout revokes the session on the server and forgets it locally`() = runTest {
        val api = FakeAuthApi()
        val storage = MemoryStorage()
        val store = store(storage, api)
        store.setSession(SERVER, access("a1"), "r1")

        store.clearSession(revoke = true)

        assertEquals(listOf("r1"), api.logouts)
        assertNull(storage.refreshToken)
        assertEquals(TokenResult.SignedOut, store.getAccessToken())
    }

    @Test
    fun `a local sign-out does not call the server`() = runTest {
        val api = FakeAuthApi()
        val storage = MemoryStorage()
        val store = store(storage, api)
        store.setSession(SERVER, access("a1"), "r1")

        store.clearSession(revoke = false)

        assertEquals(emptyList<String>(), api.logouts)
        assertNull(storage.refreshToken)
    }
}
