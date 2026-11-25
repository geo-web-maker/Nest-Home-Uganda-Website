package __PACKAGE__;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge to VisitTrackerService: start() when a nurse arrives, stop() when she leaves, drain() to collect the
 * location samples recorded while the app was closed. A tap on the ongoing notification reaches the web app as a
 * "notificationTap" event carrying the in-app path to open.
 */
@CapacitorPlugin(name = "VisitTracker")
public class VisitTrackerPlugin extends Plugin {

    @Override
    public void load() { deliverTap(getActivity() == null ? null : getActivity().getIntent()); }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliverTap(intent);
    }

    private void deliverTap(Intent intent) {
        if (intent == null) return;
        String link = intent.getStringExtra("deep_link");
        if (link == null || link.isEmpty()) return;
        intent.removeExtra("deep_link");
        JSObject data = new JSObject();
        data.put("deep_link", link);
        notifyListeners("notificationTap", data, true);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String visitId = call.getString("visitId");
        if (visitId == null || visitId.isEmpty()) { call.reject("visitId is required"); return; }
        Context context = getContext();
        Intent intent = new Intent(context, VisitTrackerService.class)
            .setAction(VisitTrackerService.ACTION_START)
            .putExtra("visit_id", visitId)
            .putExtra("started_at", call.getLong("startedAt", System.currentTimeMillis()))
            .putExtra("interval_ms", call.getLong("intervalMs", 120_000L))
            .putExtra("title", call.getString("title"))
            .putExtra("text", call.getString("text"));
        try {
            ContextCompat.startForegroundService(context, intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not start the visit timer: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.startService(new Intent(context, VisitTrackerService.class).setAction(VisitTrackerService.ACTION_STOP));
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(VisitTrackerService.PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("running", prefs.getBoolean("running", false));
        result.put("visitId", prefs.getString("visit_id", ""));
        result.put("startedAt", prefs.getLong("started_at", 0));
        call.resolve(result);
    }

    @PluginMethod
    public void drain(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("points", VisitTrackerService.drain(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read saved locations");
        }
    }
}
