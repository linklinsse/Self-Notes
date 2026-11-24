package app.selfnotes.widget

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WidgetMarkdownTest {
    /** Same file as the TypeScript tests (frontend/src/markdown/task-items.fixtures.json). */
    @Test
    fun `NOTE-5 task items match the shared fixtures`() {
        val fixtures = JSONObject(File("../../src/markdown/task-items.fixtures.json").readText())
        val cases = fixtures.getJSONArray("cases")
        assertTrue(cases.length() >= 8)
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            val expected = case.getJSONArray("items").let { items ->
                (0 until items.length()).map { j ->
                    val item = items.getJSONObject(j)
                    item.getBoolean("checked") to WidgetMarkdown.stripInline(item.getString("text"))
                }
            }
            val tasks = WidgetMarkdown.parse(case.getString("content")).blocks.filterIsInstance<WidgetBlock.Task>()
            assertEquals(case.getString("name"), expected, tasks.map { it.checked to it.text })
        }
    }

    @Test
    fun `WIDGET-5 keeps blocks and removes inline formatting`() {
        val content = """
            # Courses **urgent**
            Some [link](http://x) and `code`
            on two lines.

            - Bread
              more about bread
            2. Second
            > Quoted *text*
            ---
            ```kotlin
            val x = 1
            ```
        """.trimIndent()
        assertEquals(
            listOf(
                WidgetBlock.Heading(1, "Courses urgent"),
                WidgetBlock.Paragraph("Some link and code\non two lines."),
                WidgetBlock.ListItem("•", "Bread\nmore about bread", 0),
                WidgetBlock.ListItem("2.", "Second", 0),
                WidgetBlock.Quote("Quoted text"),
                WidgetBlock.Rule,
                WidgetBlock.Code("val x = 1"),
            ),
            WidgetMarkdown.parse(content).blocks,
        )
    }

    @Test
    fun `WIDGET-6 task blocks carry their state and depth`() {
        val blocks = WidgetMarkdown.parse("```\n- [ ] code\n```\n- [ ] **Milk**\n  - [x] Bread").blocks
        assertEquals(
            listOf(
                WidgetBlock.Code("- [ ] code"),
                WidgetBlock.Task("Milk", false, 0),
                WidgetBlock.Task("Bread", true, 1),
            ),
            blocks,
        )
    }

    @Test
    fun `NOTE-18 NOTE-19 the table of contents is hidden and diagrams are named`() {
        val blocks = WidgetMarkdown.parse("[[_TOC_]]\n\n```mermaid\ngraph TD\n```\n| a | b |\n|---|---|\n| 1 | 2 |").blocks
        assertEquals(
            listOf(
                WidgetBlock.Paragraph(WidgetMarkdown.DIAGRAM),
                WidgetBlock.Paragraph("a · b"),
                WidgetBlock.Paragraph("1 · 2"),
            ),
            blocks,
        )
    }

    @Test
    fun `setext headings`() {
        assertEquals(
            listOf(WidgetBlock.Heading(1, "Title"), WidgetBlock.Heading(2, "Sub")),
            WidgetMarkdown.parse("Title\n=====\nSub\n---").blocks,
        )
    }

    @Test
    fun `long notes are cut`() {
        val parsed = WidgetMarkdown.parse((1..10).joinToString("\n\n") { "Paragraph $it" }, maxBlocks = 4)
        assertEquals(4, parsed.blocks.size)
        assertTrue(parsed.truncated)
        assertFalse(WidgetMarkdown.parse("One").truncated)
    }

    @Test
    fun `NOTE-2 a single line break is kept, and emphasis may span it`() {
        assertEquals(
            listOf(
                WidgetBlock.Paragraph("One\ntwo bold\nwords end\nlast"),
                WidgetBlock.Quote("First\nsecond"),
            ),
            WidgetMarkdown.parse("One  \ntwo **bold\nwords** end\\\r\nlast\n\n> First\n> second").blocks,
        )
    }

    @Test
    fun `stripInline matches the TypeScript version`() {
        assertEquals(
            "bold it link code old snake_case",
            WidgetMarkdown.stripInline("**bold** _it_ [link](http://x) `code` ~~old~~ snake_case"),
        )
    }
}
