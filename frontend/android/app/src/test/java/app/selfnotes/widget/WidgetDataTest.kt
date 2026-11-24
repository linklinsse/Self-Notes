package app.selfnotes.widget

import androidx.datastore.preferences.core.mutablePreferencesOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetDataTest {
    @Test
    fun `WIDGET-10 reads the CSS colors of the themes`() {
        assertEquals(0xFF0D0D12.toInt(), CssColor.parse("#0d0d12"))
        assertEquals(0xFFFFDD33.toInt(), CssColor.parse("#FD3"))
        assertEquals(0x80112233.toInt(), CssColor.parse("#11223380"))
        assertEquals(0x1AF4B8C8, CssColor.parse("rgba(244,184,200,0.10)"))
        assertEquals(0xFF010203.toInt(), CssColor.parse("rgb(1, 2, 3)"))
        assertNull(CssColor.parse("rgba(300,0,0,1)"))
        assertNull(CssColor.parse("blue"))
        assertNull(CssColor.parse("#12345"))
    }

    @Test
    fun `WIDGET-10 theme colors survive a round trip, and broken JSON falls back to the default theme`() {
        val colors = WidgetColors.DEFAULT.copy(dark = false, accent = 0xFF123456.toInt())
        assertEquals(colors, WidgetColors.fromJson(colors.toJson()))
        assertEquals(WidgetColors.DEFAULT, WidgetColors.fromJson("{oops"))
        val tokens = mapOf(
            "background" to "#ffffff", "surface" to "#fafafa", "card" to "#f0f0f0", "accent" to "#c0264b",
            "onAccentFill" to "#ffffff", "border" to "rgba(0,0,0,0.1)", "text1" to "#111111", "text2" to "#555555",
        )
        val light = WidgetColors.fromCss(tokens, dark = false)!!
        assertEquals(0xFFC0264B.toInt(), light.accentFill) // falls back to accent
        assertNull(WidgetColors.fromCss(tokens - "text1", dark = false))
    }

    @Test
    fun `configurations survive a round trip`() {
        val list = WidgetConfig.NotesList(Scope.SHARED, NoteKind.LIST, "cat-1", "Courses")
        assertEquals(list, WidgetConfig.fromJson(list.toJson()))
        assertEquals("Lists · Courses", list.title)
        assertEquals("My notes", WidgetConfig.NotesList(Scope.MINE).title)
        assertEquals(WidgetConfig.Note("n-1"), WidgetConfig.fromJson(WidgetConfig.Note("n-1").toJson()))
        assertNull(WidgetConfig.fromJson("{\"kind\":\"note\"}"))
        assertNull(WidgetConfig.fromJson(null))
    }

    @Test
    fun `WIDGET-4 rows from note summaries`() {
        val rows = NoteRow.parseAll(
            """[
              {"id":"a","title":"","type":"list","preview":"Milk · Bread","pinned":true,"locked":false,
               "categories":[{"id":"c","name":"Home","color":"#ff0000"}],"items":{"checked":1,"total":3}},
              {"id":"b","title":"Coffre","type":"text","preview":"","locked":true,"categories":[],"items":null}
            ]""",
        )
        assertEquals("Milk · Bread", rows[0].title) // first line stands in for a missing title
        assertEquals(listOf(0xFFFF0000.toInt()), rows[0].categoryColors)
        assertEquals(1 to 3, rows[0].checked to rows[0].total)
        assertTrue(rows[1].locked)
        assertNull(rows[1].total)
        assertEquals(emptyList<NoteRow>(), NoteRow.parseAll("not json"))
    }

    @Test
    fun `WIDGET-5 the note carries its categories, in order, with their colors`() {
        val note = NoteView.parse(
            """{"id":"n","title":"T","type":"list","content":"- [ ] a","locked":false,"categories":[
              {"id":"1","name":"Courses","color":"#22C55E"},{"id":"2","name":"Broken","color":"green"},{"id":"3","name":"Maison","color":"#ff4d8d"}
            ]}""",
        )!!
        assertEquals(
            listOf(WidgetCategory("Courses", 0xFF22C55E.toInt()), WidgetCategory("Maison", 0xFFFF4D8D.toInt())),
            note.categories,
        )
        assertEquals(emptyList<WidgetCategory>(), NoteView.parse("""{"id":"n"}""")!!.categories)
    }

    @Test
    fun `CAT-2 chips use black or white text, whichever reads better`() {
        val black = 0xFF000000.toInt()
        val white = 0xFFFFFFFF.toInt()
        assertEquals(black, readableTextOn(0xFF22C55E.toInt()))
        assertEquals(black, readableTextOn(0xFFFFD32C.toInt()))
        assertEquals(white, readableTextOn(0xFF1E3A8A.toInt()))
        assertEquals(black, readableTextOn(white))
        assertEquals(white, readableTextOn(black))
    }

    @Test
    fun `the category tint mixes colors like the app's cards`() {
        assertEquals(0xFF000000.toInt(), mixColors(0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0.0))
        assertEquals(0xFF808080.toInt(), mixColors(0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0.5))
        assertEquals(0xFF141F1F.toInt(), mixColors(0xFF22C55E.toInt(), 0xFF13131A.toInt(), 0.07))
    }

    @Test
    fun `WIDGET-8 WIDGET-9 WIDGET-11 how each refresh outcome changes a widget`() {
        val prefs = mutablePreferencesOf()
        WidgetUpdater.apply(prefs, ApiResult.Ok("[1]"), "theme", now = 1000)
        assertEquals("[1]", prefs[WidgetKeys.DATA])
        assertEquals(WidgetStatus.OK, WidgetStatus.of(prefs))
        assertEquals(1000L, prefs[WidgetKeys.UPDATED_AT])

        // Offline: the last data stays, marked as old.
        WidgetUpdater.apply(prefs, ApiResult.Offline, "theme", now = 2000)
        assertEquals("[1]", prefs[WidgetKeys.DATA])
        assertEquals(true, prefs[WidgetKeys.STALE])
        assertEquals(1000L, prefs[WidgetKeys.UPDATED_AT])

        // Signed out: nothing of the account stays on the home screen.
        WidgetUpdater.apply(prefs, ApiResult.SignedOut, "theme", now = 3000)
        assertNull(prefs[WidgetKeys.DATA])
        assertEquals(WidgetStatus.SIGNED_OUT, WidgetStatus.of(prefs))

        WidgetUpdater.apply(prefs, ApiResult.NotFound, "theme", now = 4000)
        assertEquals(WidgetStatus.UNAVAILABLE, WidgetStatus.of(prefs))

        // Never received anything and the server fails: an error message instead of "Loading…".
        val fresh = mutablePreferencesOf()
        WidgetUpdater.apply(fresh, ApiResult.Failed(500), "theme", now = 5000)
        assertEquals(WidgetStatus.ERROR, WidgetStatus.of(fresh))
        assertEquals("theme", fresh[WidgetKeys.THEME])
    }
}
