package app.selfnotes.widget

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import app.selfnotes.session.SessionStore
import kotlinx.coroutines.launch

/** Setup of the Notes and Notes by type widgets (WIDGET-1, WIDGET-2): scope, type, category. */
class NotesListConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appWidgetId = WidgetSetup.widgetId(this) ?: return finish()
        // Backing out removes a widget that is being placed.
        setResult(RESULT_CANCELED, WidgetSetup.result(appWidgetId))
        val byType = WidgetSetup.receiverOf(this, appWidgetId) == NotesByTypeWidgetReceiver::class.java.name
        val colors = WidgetTheme.load(this)
        edgeToEdge(colors)
        setContent {
            ConfigTheme(colors) {
                NotesListSetup(
                    byType = byType,
                    loadCurrent = { WidgetSetup.currentConfig(this, appWidgetId) as? WidgetConfig.NotesList },
                    onSave = { config ->
                        lifecycleScope.launch {
                            WidgetSetup.save(this@NotesListConfigActivity, appWidgetId, config)
                            setResult(RESULT_OK, WidgetSetup.result(appWidgetId))
                            finish()
                        }
                    },
                    onCancel = ::finish,
                )
            }
        }
    }
}

private data class CategoryChoice(val id: String, val name: String, val color: Int?)

/** Categories for the picker, or why there are none. */
private sealed interface CategoriesState {
    data object Loading : CategoriesState

    data class Ready(val categories: List<CategoryChoice>) : CategoriesState

    data class Unavailable(val message: String) : CategoriesState
}

@Composable
private fun NotesListSetup(
    byType: Boolean,
    loadCurrent: suspend () -> WidgetConfig.NotesList?,
    onSave: (WidgetConfig.NotesList) -> Unit,
    onCancel: () -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var scope by remember { mutableStateOf(Scope.ALL) }
    var type by remember { mutableStateOf(NoteKind.LIST) }
    var category by remember { mutableStateOf<CategoryChoice?>(null) }
    var reconfiguring by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        loadCurrent()?.let { current ->
            reconfiguring = true
            scope = current.scope
            current.type?.let { type = it }
            current.categoryId?.let { category = CategoryChoice(it, current.categoryName.orEmpty(), null) }
        }
    }
    val categories by produceState<CategoriesState>(CategoriesState.Loading) {
        value = when (val result = WidgetApi(SessionStore.get(context)).categories()) {
            is ApiResult.Ok -> CategoriesState.Ready(
                (0 until result.value.length()).mapNotNull { i ->
                    result.value.optJSONObject(i)?.let {
                        CategoryChoice(it.optString("id"), it.optString("name"), CssColor.parse(it.optString("color")))
                    }
                },
            )
            ApiResult.SignedOut -> CategoriesState.Unavailable("Sign in to Self-Notes to choose a category.")
            ApiResult.Offline -> CategoriesState.Unavailable("Categories need a connection to the server.")
            else -> CategoriesState.Unavailable("Categories could not be loaded.")
        }
    }

    ConfigScreen(
        title = if (byType) "Notes by type" else "Notes",
        confirmLabel = if (reconfiguring) "Save" else "Add widget",
        onConfirm = {
            onSave(
                WidgetConfig.NotesList(
                    scope = scope,
                    type = if (byType) type else null,
                    categoryId = category?.id,
                    categoryName = category?.name?.ifEmpty { null },
                ),
            )
        },
        onCancel = onCancel,
    ) {
        LazyColumn {
            if (byType) {
                item { SectionTitle("Type") }
                items(NoteKind.entries) { kind ->
                    RadioRow(selected = type == kind, onClick = { type = kind }) { Text(kind.label) }
                }
            }
            item { SectionTitle("Notes") }
            items(Scope.entries) { option ->
                RadioRow(selected = scope == option, onClick = { scope = option }) { Text(option.label) }
            }
            item { SectionTitle("Category") }
            item {
                RadioRow(selected = category == null, onClick = { category = null }) { Text("Any category") }
            }
            when (val state = categories) {
                CategoriesState.Loading -> item { Hint("Loading categories…") }
                is CategoriesState.Unavailable -> item { Hint(state.message) }
                is CategoriesState.Ready -> {
                    if (state.categories.isEmpty()) item { Hint("No categories yet.") }
                    items(state.categories, key = { it.id }) { choice ->
                        RadioRow(selected = category?.id == choice.id, onClick = { category = choice }) {
                            ColorDot(choice.color)
                            Text(choice.name)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 6.dp),
    )
}

@Composable
private fun ColorDot(color: Int?) {
    if (color == null) return
    Box(modifier = Modifier.padding(end = 10.dp).size(12.dp).clip(CircleShape).background(Color(color)))
}
