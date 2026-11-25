package __PACKAGE__;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Foreground service that runs for the length of a visit. It shows an ongoing notification with a live
 * stopwatch (drawn by the system, so it keeps counting with the app closed) and records the nurse's location
 * every few minutes. Samples are kept on the device and uploaded by the app, so no sign-in token lives here.
 * Tapping the notification opens the running visit.
 */
public class VisitTrackerService extends Service implements LocationListener {
    static final String PREFS = "visit_tracker";
    static final String ACTION_START = "start";
    static final String ACTION_STOP = "stop";
    static final String CHANNEL_ID = "visit_timer";
    static final int NOTIFICATION_ID = 7421;
    private static final int MAX_POINTS = 2000;
    private static final Object LOCK = new Object();

    private LocationManager locations;
    private long lastSavedAt = 0;
    private long intervalMs = 120_000L;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutDown(prefs);
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_START.equals(intent.getAction())) {
            prefs.edit()
                .putString("visit_id", intent.getStringExtra("visit_id"))
                .putLong("started_at", intent.getLongExtra("started_at", System.currentTimeMillis()))
                .putLong("interval_ms", Math.max(30_000L, intent.getLongExtra("interval_ms", 120_000L)))
                .putString("title", intent.getStringExtra("title"))
                .putString("text", intent.getStringExtra("text"))
                .putBoolean("running", true)
                .apply();
        }
        // After the system restarts the service there is no intent, so everything comes from the saved session.
        if (!prefs.getBoolean("running", false)) { stopSelf(); return START_NOT_STICKY; }
        intervalMs = prefs.getLong("interval_ms", 120_000L);
        startInForeground(prefs);
        startLocationUpdates();
        return START_STICKY;
    }

    private void startInForeground(SharedPreferences prefs) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Visit timer", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows how long the current visit has been running");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            open.putExtra("deep_link", "/active/" + prefs.getString("visit_id", ""));
        }
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(this, 0, open, piFlags);
        int icon = getResources().getIdentifier("ic_stat_nest", "drawable", getPackageName());
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_menu_mylocation)
            .setContentTitle(valueOr(prefs.getString("title", null), "Visit in progress"))
            .setContentText(valueOr(prefs.getString("text", null), "Time on this visit is being recorded"))
            .setUsesChronometer(true)
            .setWhen(prefs.getLong("started_at", System.currentTimeMillis()))
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(tap)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startLocationUpdates() {
        if (locations != null) return;
        boolean allowed = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!allowed) { savePoint(null, "denied"); return; }
        locations = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            boolean any = false;
            for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                if (locations.isProviderEnabled(provider)) {
                    locations.requestLocationUpdates(provider, intervalMs, 0f, this, Looper.getMainLooper());
                    any = true;
                }
            }
            if (!any) savePoint(null, "unavailable");
        } catch (SecurityException error) {
            savePoint(null, "denied");
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        if (now - lastSavedAt < intervalMs - 5_000L) return; // GPS and network both report; keep one per interval
        lastSavedAt = now;
        savePoint(location, location.getAccuracy() > 100f ? "low_accuracy" : "good");
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}

    private void savePoint(Location location, String state) {
        synchronized (LOCK) {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            try {
                JSONArray points = new JSONArray(prefs.getString("points", "[]"));
                JSONObject point = new JSONObject();
                point.put("at", System.currentTimeMillis());
                point.put("state", state);
                if (location != null) {
                    point.put("lat", location.getLatitude());
                    point.put("lng", location.getLongitude());
                    point.put("accuracy", location.getAccuracy());
                }
                points.put(point);
                JSONArray kept = points;
                if (points.length() > MAX_POINTS) {
                    kept = new JSONArray();
                    for (int i = points.length() - MAX_POINTS; i < points.length(); i++) kept.put(points.get(i));
                }
                prefs.edit().putString("points", kept.toString()).apply();
            } catch (Exception ignored) { /* a lost sample must never crash the timer */ }
        }
    }

    /** Returns every saved sample and clears the list. */
    static JSONArray drain(Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            try {
                JSONArray points = new JSONArray(prefs.getString("points", "[]"));
                prefs.edit().putString("points", "[]").apply();
                return points;
            } catch (Exception error) {
                return new JSONArray();
            }
        }
    }

    private void shutDown(SharedPreferences prefs) {
        if (locations != null) { try { locations.removeUpdates(this); } catch (SecurityException ignored) {} locations = null; }
        prefs.edit().putBoolean("running", false).apply();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (locations != null) { try { locations.removeUpdates(this); } catch (SecurityException ignored) {} locations = null; }
        super.onDestroy();
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
