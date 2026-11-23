package app.selfnotes.widget

import app.selfnotes.session.AccessToken
import app.selfnotes.session.AuthApi
import app.selfnotes.session.RefreshResult
import app.selfnotes.session.SessionStorage
import app.selfnotes.session.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private class MemoryStorage(override var serverUrl: String?, override var refreshToken: String?) : SessionStorage

/** Each refresh hands out the next access token: "access-1", "access-2"… */
private class CountingAuthApi : AuthApi {
    var refreshes = 0

    override fun refresh(serverUrl: String, refreshToken: String): RefreshResult {
        refreshes++
        return RefreshResult.Success(AccessToken("access-$refreshes", "", Long.MAX_VALUE), "refresh-$refreshes")
    }

    override fun logout(serverUrl: String, refreshToken: String) = Unit
}

/** The widgets' API calls against a local server that mimics the API (docs/api.md). */
class WidgetApiTest {
    private lateinit var server: MockWebServer
    private lateinit var auth: CountingAuthApi
    private lateinit var api: WidgetApi

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
        auth = CountingAuthApi()
        val storage = MemoryStorage(server.url("").toString().trimEnd('/'), "refresh-0")
        api = WidgetApi(SessionStore(storage, auth, Dispatchers.Unconfined))
    }

    @After
    fun stop() = server.shutdown()

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    @Test
    fun `WIDGET-1 WIDGET-2 WIDGET-4 lists notes with the widget's filters and the app's session`() = runTest {
        respond(200, """{"items":[{"id":"a"}],"nextCursor":null}""")

        val result = api.listNotes(WidgetConfig.NotesList(Scope.SHARED, NoteKind.LIST, "cat 1"))

        assertEquals("a", (result as ApiResult.Ok).value.getJSONObject(0).getString("id"))
        val request = server.takeRequest()
        assertEquals("/api/v1/notes?scope=shared&type=list&category=cat+1&sort=favorites&limit=50", request.path)
        assertEquals("Bearer access-1", request.getHeader("Authorization"))
    }

    @Test
    fun `WIDGET-6 toggles an item by index and text`() = runTest {
        respond(200, """{"id":"n","content":"- [x] Milk"}""")

        val result = api.toggleItem("n", 0, "Milk", true)

        assertEquals("- [x] Milk", (result as ApiResult.Ok).value.getString("content"))
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/notes/n/items/toggle", request.path)
        val body = JSONObject(request.body.readUtf8())
        assertEquals(0, body.getInt("index"))
        assertEquals("Milk", body.getString("text"))
        assertTrue(body.getBoolean("checked"))
    }

    @Test
    fun `AUTH-4 a refused access token is refreshed once, under the session's mutex`() = runTest {
        respond(401)
        respond(200, """{"id":"n"}""")

        assertTrue(api.getNote("n") is ApiResult.Ok)
        assertEquals("Bearer access-1", server.takeRequest().getHeader("Authorization"))
        assertEquals("Bearer access-2", server.takeRequest().getHeader("Authorization"))
        assertEquals(2, auth.refreshes)
    }

    @Test
    fun `WIDGET-11 a deleted or unshared note is unavailable, and conflicts keep their code`() = runTest {
        respond(404)
        assertEquals(ApiResult.NotFound, api.getNote("gone"))
        respond(403)
        assertEquals(ApiResult.NotFound, api.getNote("unshared"))
        respond(409, """{"error":{"code":"ITEM_NOT_FOUND","message":"x"}}""")
        assertEquals(ApiResult.Conflict("ITEM_NOT_FOUND"), api.toggleItem("n", 4, "Gone", true))
    }

    @Test
    fun `WIDGET-9 without a session nothing is sent`() = runTest {
        val signedOut = WidgetApi(SessionStore(MemoryStorage(server.url("").toString(), null), auth, Dispatchers.Unconfined))
        assertEquals(ApiResult.SignedOut, signedOut.getNote("n"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `WIDGET-8 an unreachable server keeps the session`() = runTest {
        api.categories() // first call: gets an access token
        server.shutdown()
        assertEquals(ApiResult.Offline, api.categories())
    }
}
