package app.selfnotes

import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.selfnotes.session.SelfNotesNativePlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        // Local plugins must be registered before the bridge starts in super.onCreate().
        registerPlugin(SelfNotesNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
