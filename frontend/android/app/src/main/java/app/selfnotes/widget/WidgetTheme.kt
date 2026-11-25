package app.selfnotes.widget

import android.content.Context
import androidx.core.content.edit
import org.json.JSONObject

/**
 * The colors of the user's current theme, as the app sends them with `setWidgetTheme`
 * (WIDGET-10). ARGB ints. Defaults to Blush Noir, the default theme, until the app runs once.
 */
data class WidgetColors(
    val dark: Boolean,
    val background: Int,
    val surface: Int,
    val card: Int,
    val accent: Int,
    val accentFill: Int,
    val onAccentFill: Int,
    val border: Int,
    val text1: Int,
    val text2: Int,
    val checkbox: Int,
    val codeBg: Int,
) {
    fun toJson(): String =
        JSONObject()
            .put("dark", dark)
            .put("background", background)
            .put("surface", surface)
            .put("card", card)
            .put("accent", accent)
            .put("accentFill", accentFill)
            .put("onAccentFill", onAccentFill)
            .put("border", border)
            .put("text1", text1)
            .put("text2", text2)
            .put("checkbox", checkbox)
            .put("codeBg", codeBg)
            .toString()

    companion object {
        /** Blush Noir (frontend/src/themes/palettes.ts). */
        val DEFAULT = WidgetColors(
            dark = true,
            background = 0xFF0D0D12.toInt(),
            surface = 0xFF13131A.toInt(),
            card = 0xFF1A1A24.toInt(),
            accent = 0xFFF4B8C8.toInt(),
            accentFill = 0xFFF4B8C8.toInt(),
            onAccentFill = 0xFF0D0D12.toInt(),
            border = 0x1AF4B8C8,
            text1 = 0xFFF0EAF2.toInt(),
            text2 = 0xFFA090A4.toInt(),
            checkbox = 0xFFF4B8C8.toInt(),
            codeBg = 0xFF0D0D12.toInt(),
        )

        /** Colors stored by [toJson]; any missing or unreadable value falls back to the default theme. */
        fun fromJson(json: String?): WidgetColors {
            if (json.isNullOrBlank()) return DEFAULT
            return try {
                val o = JSONObject(json)
                val d = DEFAULT
                WidgetColors(
                    dark = o.optBoolean("dark", d.dark),
                    background = o.optInt("background", d.background),
                    surface = o.optInt("surface", d.surface),
                    card = o.optInt("card", d.card),
                    accent = o.optInt("accent", d.accent),
                    accentFill = o.optInt("accentFill", d.accentFill),
                    onAccentFill = o.optInt("onAccentFill", d.onAccentFill),
                    border = o.optInt("border", d.border),
                    text1 = o.optInt("text1", d.text1),
                    text2 = o.optInt("text2", d.text2),
                    checkbox = o.optInt("checkbox", d.checkbox),
                    codeBg = o.optInt("codeBg", d.codeBg),
                )
            } catch (_: org.json.JSONException) {
                DEFAULT
            }
        }

        /**
         * From the app's theme tokens (CSS colors: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`).
         * Returns null when a required color cannot be read.
         */
        fun fromCss(tokens: Map<String, String?>, dark: Boolean): WidgetColors? {
            fun color(name: String): Int? = tokens[name]?.let(CssColor::parse)
            return WidgetColors(
                dark = dark,
                background = color("background") ?: return null,
                surface = color("surface") ?: return null,
                card = color("card") ?: return null,
                accent = color("accent") ?: return null,
                accentFill = color("accentFill") ?: color("accent") ?: return null,
                onAccentFill = color("onAccentFill") ?: return null,
                border = color("border") ?: return null,
                text1 = color("text1") ?: return null,
                text2 = color("text2") ?: return null,
                checkbox = color("checkbox") ?: color("accent") ?: return null,
                codeBg = color("codeBg") ?: color("background") ?: return null,
            )
        }
    }
}

/** Where the theme is kept between `setWidgetTheme` calls. */
object WidgetTheme {
    private const val PREFS = "selfnotes.widgets"
    private const val KEY_COLORS = "themeColors"

    fun load(context: Context): WidgetColors =
        WidgetColors.fromJson(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_COLORS, null))

    fun save(context: Context, colors: WidgetColors) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString(KEY_COLORS, colors.toJson()) }
    }
}

/** The CSS color syntaxes used by the themes (frontend/src/themes/palettes.ts). */
object CssColor {
    private val RGB = Regex("""^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$""", RegexOption.IGNORE_CASE)

    fun parse(value: String): Int? {
        val v = value.trim()
        if (v.startsWith("#")) {
            val hex = v.substring(1)
            if (!hex.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null
            return when (hex.length) {
                3 -> argb(0xFF, hex.dup(0), hex.dup(1), hex.dup(2))
                6 -> argb(0xFF, hex.byte(0), hex.byte(2), hex.byte(4))
                8 -> argb(hex.byte(6), hex.byte(0), hex.byte(2), hex.byte(4))
                else -> null
            }
        }
        val match = RGB.matchEntire(v) ?: return null
        val (r, g, b) = match.groupValues.subList(1, 4).map { it.toInt() }
        if (r > 255 || g > 255 || b > 255) return null
        val alpha = match.groupValues[4].takeIf { it.isNotEmpty() }?.toDoubleOrNull() ?: 1.0
        if (alpha < 0 || alpha > 1) return null
        return argb((alpha * 255 + 0.5).toInt(), r, g, b)
    }

    private fun argb(a: Int, r: Int, g: Int, b: Int): Int = (a shl 24) or (r shl 16) or (g shl 8) or b

    private fun String.byte(at: Int): Int = substring(at, at + 2).toInt(16)

    private fun String.dup(at: Int): Int = "${this[at]}${this[at]}".toInt(16)
}

/** [over] laid on [base] with the given opacity (CSS `color-mix`). Both opaque. */
fun mixColors(over: Int, base: Int, ratio: Double): Int {
    fun channel(shift: Int): Int {
        val o = (over shr shift) and 0xFF
        val b = (base shr shift) and 0xFF
        return (o * ratio + b * (1 - ratio) + 0.5).toInt()
    }
    return (0xFF shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
}

/** CAT-2: black or white text, whichever reads better (frontend/src/themes/contrast.ts). */
fun readableTextOn(color: Int): Int {
    fun linear(shift: Int): Double {
        val c = ((color shr shift) and 0xFF) / 255.0
        return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
    }
    val luminance = 0.2126 * linear(16) + 0.7152 * linear(8) + 0.0722 * linear(0)
    val onBlack = (luminance + 0.05) / 0.05
    val onWhite = 1.05 / (luminance + 0.05)
    return if (onBlack >= onWhite) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
}
