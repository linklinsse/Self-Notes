package app.selfnotes

import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.selfnotes.session.SelfNotesNativePlugin
import app.selfnotes.widget.WidgetUpdater
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        // Local plugins must be registered before the bridge starts in super.onCreate().
        registerPlugin(SelfNotesNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    /**
     * WIDGET-8: the app leaves the screen (Home, another app, Recents), so the widgets show the last
     * changes. Native on purpose: the page may be frozen or killed before it can ask for it. A save
     * still on its way asks again when it ends (SelfNotesNativePlugin.refreshWidgets).
     */
    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) WidgetUpdater.requestRefresh(applicationContext)
    }
}
