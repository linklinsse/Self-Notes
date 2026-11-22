package app.selfnotes.session

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** The refresh and logout calls against a local server that mimics the API (docs/api.md, "Auth"). */
class HttpAuthApiTest {
    private lateinit var server: MockWebServer
    private lateinit var baseUrl: String

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
        baseUrl = server.url("").toString().trimEnd('/')
    }

    @After
    fun stop() = server.shutdown()

    private fun respond(status: Int, body: String = "") =
        server.enqueue(MockResponse().setResponseCode(status).setBody(body))

    @Test
    fun `refresh sends the token in the body and reads the rotated tokens`() {
        respond(200, """{"accessToken":"a2","accessTokenExpiresAt":"2026-11-21T10:15:30.123Z","refreshToken":"r2"}""")

        val result = HttpAuthApi().refresh(baseUrl, "r1")

        assertEquals(
            RefreshResult.Success(AccessToken("a2", "2026-11-21T10:15:30.123Z", 1_795_256_130_123L), "r2"),
            result,
        )
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/auth/refresh", request.path)
        assertEquals("body", request.getHeader("X-Token-Transport"))
        assertEquals("r1", JSONObject(request.body.readUtf8()).getString("refreshToken"))
    }

    @Test
    fun `AUTH-4 refresh maps 401 to a sign-out and other errors to a failure`() {
        respond(401, """{"error":{"code":"INVALID_REFRESH_TOKEN","message":"x"}}""")
        assertEquals(RefreshResult.Rejected, HttpAuthApi().refresh(baseUrl, "r1"))

        respond(429)
        assertEquals(RefreshResult.Failed(429), HttpAuthApi().refresh(baseUrl, "r1"))
    }

    @Test
    fun `AUTH-4 an unreachable server is not a sign-out`() {
        server.shutdown()
        assertEquals(RefreshResult.Unreachable, HttpAuthApi(timeoutMs = 2_000).refresh(baseUrl, "r1"))
    }

    @Test
    fun `a 200 without tokens is a failure, not a session`() {
        respond(200, """{"accessToken":"a2"}""")
        assertEquals(RefreshResult.Failed(200), HttpAuthApi().refresh(baseUrl, "r1"))
    }

    @Test
    fun `logout posts the refresh token`() {
        respond(204)
        HttpAuthApi().logout(baseUrl, "r1")

        val request = server.takeRequest()
        assertEquals("/api/v1/auth/logout", request.path)
        assertEquals("body", request.getHeader("X-Token-Transport"))
        assertEquals("r1", JSONObject(request.body.readUtf8()).getString("refreshToken"))
    }

    @Test
    fun `IsoTime reads Date toISOString output`() {
        assertEquals(1_795_256_130_123L, IsoTime.parseMillis("2026-11-21T10:15:30.123Z"))
        assertEquals(1_795_256_130_000L, IsoTime.parseMillis("2026-11-21T10:15:30Z"))
        assertNull(IsoTime.parseMillis("tomorrow"))
    }
}
