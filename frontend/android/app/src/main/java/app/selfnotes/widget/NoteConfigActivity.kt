package app.selfnotes.widget

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import app.selfnotes.R
import app.selfnotes.session.SessionStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Setup of the Note widget (WIDGET-3): a searchable list of the user's notes. Also opened by the
 * "Pick another note" button of a widget whose note is unavailable (WIDGET-11).
 */
class NoteConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appWidgetId = WidgetSetup.widgetId(this) ?: return finish()
        setResult(RESULT_CANCELED, WidgetSetup.result(appWidgetId))
        val colors = WidgetTheme.load(this)
        edgeToEdge(colors)
        setContent {
            ConfigTheme(colors) {
                NotePicker(
                    onPick = { noteId ->
                        lifecycleScope.launch {
                            WidgetSetup.save(this@NoteConfigActivity, appWidgetId, WidgetConfig.Note(noteId))
                            setResult(RESULT_OK, WidgetSetup.result(appWidgetId))
                            finish()
                        }
                    },
                    onCancel = ::finish,
                    onOpenApp = { startActivity(WidgetIntents.openApp(this)) },
                )
            }
        }
    }
}

private sealed interface PickerState {
    data object Loading : PickerState

    data class Ready(val notes: List<NoteRow>) : PickerState

    data object SignedOut : PickerState

    data class Failed(val message: String) : PickerState
}

@Composable
private fun NotePicker(onPick: (String) -> Unit, onCancel: () -> Unit, onOpenApp: () -> Unit) {
    val context = LocalContext.current
    var query by remember { mutableStateOf("") }
    var state by remember { mutableStateOf<PickerState>(PickerState.Loading) }
    var attempt by remember { mutableIntStateOf(0) }

    LaunchedEffect(query, attempt) {
        if (query.isNotEmpty()) delay(300) // wait for the user to stop typing
        state = PickerState.Loading
        val all = WidgetConfig.NotesList(Scope.ALL)
        state = when (val result = WidgetApi(SessionStore.get(context)).listNotes(all, limit = 50, query = query, sort = "updated")) {
            is ApiResult.Ok -> PickerState.Ready(NoteRow.parseAll(result.value.toString()))
            ApiResult.SignedOut -> PickerState.SignedOut
            ApiResult.Offline -> PickerState.Failed("The server cannot be reached.")
            else -> PickerState.Failed("The notes could not be loaded.")
        }
    }

    ConfigScreen(title = "Choose a note", confirmLabel = null, onConfirm = {}, onCancel = onCancel) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        )
        when (val current = state) {
            PickerState.Loading -> Row(modifier = Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
            }
            PickerState.SignedOut -> Column(modifier = Modifier.padding(vertical = 16.dp)) {
                Text("Sign in to Self-Notes first, then add the widget again.")
                Spacer(modifier = Modifier.size(12.dp))
                Button(onClick = onOpenApp) { Text("Open Self-Notes") }
            }
            is PickerState.Failed -> Column(modifier = Modifier.padding(vertical = 16.dp)) {
                Text(current.message)
                Spacer(modifier = Modifier.size(12.dp))
                Button(onClick = { attempt++ }) { Text("Try again") }
            }
            is PickerState.Ready ->
                if (current.notes.isEmpty()) {
                    Text(
                        text = if (query.isBlank()) "No notes yet." else "No note matches.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                } else {
                    LazyColumn {
                        items(current.notes, key = { it.id }) { note -> NoteChoice(note) { onPick(note.id) } }
                    }
                }
        }
    }
}

@Composable
private fun NoteChoice(note: NoteRow, onClick: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable(onClick = onClick),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                painter = painterResource(if (note.isList) R.drawable.ic_widget_list else R.drawable.ic_widget_text),
                contentDescription = if (note.isList) "List" else "Text note",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = note.title.ifEmpty { "Untitled" },
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!note.locked && note.preview.isNotBlank()) {
                    Text(
                        text = note.preview,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (note.locked) {
                Icon(
                    painter = painterResource(R.drawable.ic_widget_lock),
                    contentDescription = "Locked",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
