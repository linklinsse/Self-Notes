package app.selfnotes.widget

/** One block of a note as the Note widget shows it (WIDGET-5). Inline formatting is already removed. */
sealed interface WidgetBlock {
    data class Heading(val level: Int, val text: String) : WidgetBlock

    data class Paragraph(val text: String) : WidgetBlock

    /** Bullet ("•") or numbered ("3.") list item. */
    data class ListItem(val marker: String, val text: String, val depth: Int) : WidgetBlock

    /**
     * A task item. [index] is its position among the note's task items and [rawText] its first
     * line as written: both identify the item for `POST /notes/{id}/items/toggle`. [text] also
     * holds the next lines of a multiline item (NOTE-4).
     */
    data class Task(val index: Int, val rawText: String, val text: String, val checked: Boolean, val depth: Int) : WidgetBlock

    data class Code(val text: String) : WidgetBlock

    data class Quote(val text: String) : WidgetBlock

    data object Rule : WidgetBlock
}

/** A GFM task item, as `parseTaskItems` in frontend/src/markdown/tasklist.ts finds it. */
data class TaskItem(val line: Int, val checked: Boolean, val text: String)

/**
 * The Markdown subset the Note widget shows (WIDGET-5): block structure and line breaks (NOTE-2).
 * Task items are found exactly like the TypeScript parsers do (same test fixtures).
 */
object WidgetMarkdown {
    private val TASK = Regex("""^(\s*)([-*+]|\d+[.)])\s+\[([ xX])\](?:[ \t]+(.*))?$""")
    private val FENCE = Regex("""^\s*(```|~~~)""")
    private val HEADING = Regex("""^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$""")
    private val BULLET = Regex("""^(\s*)([-*+])\s+(.*)$""")
    private val NUMBERED = Regex("""^(\s*)(\d+)[.)]\s+(.*)$""")
    private val QUOTE = Regex("""^\s{0,3}>\s?(.*)$""")
    private val RULE = Regex("""^\s{0,3}([-*_])(\s*\1){2,}\s*$""")
    private val SETEXT_1 = Regex("""^\s{0,3}=+\s*$""")
    private val SETEXT_2 = Regex("""^\s{0,3}-+\s*$""")
    private val TABLE_ROW = Regex("""^\s*\|.*\|\s*$""")
    private val TABLE_SEPARATOR = Regex("""^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$""")
    private val TOC = Regex("""^\s*(\[\[_TOC_]]|\[TOC])\s*$""", RegexOption.IGNORE_CASE)

    /** Same as `parseTaskItems`: document order, lines inside fenced code blocks ignored. */
    fun taskItems(content: String): List<TaskItem> {
        val items = mutableListOf<TaskItem>()
        var inFence = false
        content.split('\n').forEachIndexed { line, raw ->
            val text = raw.removeSuffix("\r")
            if (FENCE.containsMatchIn(text)) {
                inFence = !inFence
                return@forEachIndexed
            }
            if (inFence) return@forEachIndexed
            TASK.matchEntire(text)?.let { match ->
                items += TaskItem(line, match.groupValues[3] != " ", match.groupValues[4].trim())
            }
        }
        return items
    }

    /** Checks or unchecks the task item at [index] (local, optimistic update). Null when it does not exist. */
    fun setChecked(content: String, index: Int, checked: Boolean): String? {
        val item = taskItems(content).getOrNull(index) ?: return null
        val lines = content.split('\n').toMutableList()
        lines[item.line] = lines[item.line].replaceFirst(Regex("""\[([ xX])]"""), if (checked) "[x]" else "[ ]")
        return lines.joinToString("\n")
    }

    /**
     * Same as `stripInline`: links, images, code, emphasis and HTML tags become plain text. Line
     * breaks are kept, and emphasis may span them: `.` does not match a line break, hence [BREAK].
     */
    fun stripInline(text: String): String =
        text.replace('\n', BREAK)
            .replace(Regex("""!\[([^\]]*)]\([^)]*\)"""), "$1")
            .replace(Regex("""\[([^\]]+)]\([^)]*\)"""), "$1")
            .replace(Regex("""`([^`]*)`"""), "$1")
            .replace(Regex("""(\*\*|__|~~)(.+?)\1"""), "$2")
            .replace(Regex("""\*(\S(?:.*?\S)?)\*"""), "$1")
            .replace(Regex("""(^|\W)_(\S(?:.*?\S)?)_(?=\W|$)"""), "$1$2")
            .replace(Regex("""<[^>]+>"""), "")
            .replace(BREAK, '\n')
            .trim()

    /** A private-use character, never found in notes. */
    private const val BREAK = '\uE000'

    /**
     * The blocks of [content], at most [maxBlocks] (a widget is not meant to show a whole book;
     * the rest is one tap away in the app). [truncated] tells whether blocks were left out.
     */
    fun parse(content: String, maxBlocks: Int = 200): Parsed {
        val blocks = mutableListOf<WidgetBlock>()
        val paragraph = StringBuilder()
        var taskIndex = 0
        var fence: StringBuilder? = null
        var fenceIsDiagram = false
        var quote: StringBuilder? = null

        fun flushParagraph() {
            if (paragraph.isNotBlank()) blocks += WidgetBlock.Paragraph(stripInline(paragraph.toString()))
            paragraph.clear()
        }

        fun flushQuote() {
            quote?.let { if (it.isNotBlank()) blocks += WidgetBlock.Quote(stripInline(it.toString())) }
            quote = null
        }

        for (raw in content.split('\n')) {
            val line = raw.removeSuffix("\r")
            val open = fence
            if (open != null) {
                if (FENCE.containsMatchIn(line)) {
                    blocks += if (fenceIsDiagram) WidgetBlock.Paragraph(DIAGRAM) else WidgetBlock.Code(open.toString().trimEnd('\n'))
                    fence = null
                } else {
                    open.append(line).append('\n')
                }
                continue
            }
            if (FENCE.containsMatchIn(line)) {
                flushParagraph()
                flushQuote()
                fence = StringBuilder()
                fenceIsDiagram = line.trim().trimStart('`', '~').trim().startsWith("mermaid", ignoreCase = true)
                continue
            }
            if (line.isBlank() || TOC.matches(line)) {
                flushParagraph()
                flushQuote()
                continue
            }
            if (paragraph.isNotEmpty() && SETEXT_1.matches(line)) {
                blocks += WidgetBlock.Heading(1, stripInline(paragraph.toString()))
                paragraph.clear()
                continue
            }
            if (paragraph.isNotEmpty() && SETEXT_2.matches(line)) {
                blocks += WidgetBlock.Heading(2, stripInline(paragraph.toString()))
                paragraph.clear()
                continue
            }
            val quoted = QUOTE.matchEntire(line)
            if (quoted != null) {
                flushParagraph()
                val current = quote ?: StringBuilder().also { quote = it }
                if (current.isNotEmpty()) current.append('\n')
                current.append(sourceLine(quoted.groupValues[1]))
            } else {
                flushQuote()
                val task = TASK.matchEntire(line)
                when {
                    task != null -> {
                        flushParagraph()
                        val rawText = task.groupValues[4].trim()
                        blocks += WidgetBlock.Task(taskIndex++, rawText, stripInline(rawText), task.groupValues[3] != " ", depth(task.groupValues[1]))
                    }
                    RULE.matches(line) -> {
                        flushParagraph()
                        blocks += WidgetBlock.Rule
                    }
                    HEADING.matchEntire(line) != null -> {
                        flushParagraph()
                        val heading = HEADING.matchEntire(line)!!
                        blocks += WidgetBlock.Heading(heading.groupValues[1].length, stripInline(heading.groupValues[2]))
                    }
                    BULLET.matchEntire(line) != null -> {
                        flushParagraph()
                        val item = BULLET.matchEntire(line)!!
                        blocks += WidgetBlock.ListItem("•", stripInline(item.groupValues[3]), depth(item.groupValues[1]))
                    }
                    NUMBERED.matchEntire(line) != null -> {
                        flushParagraph()
                        val item = NUMBERED.matchEntire(line)!!
                        blocks += WidgetBlock.ListItem("${item.groupValues[2]}.", stripInline(item.groupValues[3]), depth(item.groupValues[1]))
                    }
                    TABLE_SEPARATOR.matches(line) && line.contains('-') && line.contains('|') -> Unit
                    TABLE_ROW.matches(line) -> {
                        flushParagraph()
                        val cells = line.trim().trim('|').split('|').map { stripInline(it) }.filter { it.isNotEmpty() }
                        if (cells.isNotEmpty()) blocks += WidgetBlock.Paragraph(cells.joinToString(" · "))
                    }
                    line.first().isWhitespace() && paragraph.isEmpty() && blocks.lastOrNull().isListLike() -> {
                        // Continuation of the previous list item: a multiline item (NOTE-4).
                        blocks[blocks.lastIndex] = blocks.last().append(stripInline(sourceLine(line)))
                    }
                    else -> {
                        if (paragraph.isNotEmpty()) paragraph.append('\n')
                        paragraph.append(sourceLine(line))
                    }
                }
            }
        }
        fence?.let { blocks += if (fenceIsDiagram) WidgetBlock.Paragraph(DIAGRAM) else WidgetBlock.Code(it.toString().trimEnd('\n')) }
        flushParagraph()
        flushQuote()
        return Parsed(blocks.take(maxBlocks), truncated = blocks.size > maxBlocks)
    }

    data class Parsed(val blocks: List<WidgetBlock>, val truncated: Boolean)

    /** Mermaid diagrams cannot be drawn in a widget. */
    const val DIAGRAM = "[Diagram: open the note to see it]"

    /** One source line, without Markdown's older line break marks (two spaces or a backslash at the end). */
    private fun sourceLine(source: String): String = source.trim().removeSuffix("\\")

    /** Two spaces (or a tab) per level, capped: a widget is narrow. */
    private fun depth(indent: String): Int = (indent.replace("\t", "  ").length / 2).coerceAtMost(3)

    private fun WidgetBlock?.isListLike() = this is WidgetBlock.ListItem || this is WidgetBlock.Task

    private fun WidgetBlock.append(more: String): WidgetBlock =
        when (this) {
            is WidgetBlock.ListItem -> copy(text = "$text\n$more")
            is WidgetBlock.Task -> copy(text = "$text\n$more")
            else -> this
        }
}
