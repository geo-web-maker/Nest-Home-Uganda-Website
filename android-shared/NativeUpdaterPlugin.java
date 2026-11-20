package __PACKAGE__;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Full-APK updates for native changes: download from a signed URL, verify SHA-256, hand the file to the
 * system installer. Android always asks the user to confirm the install. Web-only changes go through
 * WebBundlePlugin instead.
 */
@CapacitorPlugin(name = "NativeUpdater")
public class NativeUpdaterPlugin extends Plugin {
    private File pendingApkFile;
    private PluginCall pendingInstallCall;

    /** Installed native version, so the web layer can compare it with the latest published APK. */
    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject out = new JSObject();
            out.put("versionName", info.versionName);
            out.put("versionCode", PackageInfoCompat.getLongVersionCode(info));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not read the app version");
        }
    }

    /**
     * JS params: { url, sha256?, fileName }. Progress events: { type: "progress", loaded, total };
     * final event: { type: "done" } once the installer has been launched.
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        final String expectedSha = call.getString("sha256");
        final String requestedName = call.getString("fileName");
        if (url == null || !url.startsWith("https://")) {
            call.reject("An https url is required");
            return;
        }
        final String fileName = requestedName == null ? "update.apk" : new File(requestedName).getName();
        call.setKeepAlive(true);

        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "apk-update");
                dir.mkdirs();
                File dest = new File(dir, fileName);
                dest.delete();

                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(60_000);
                conn.connect();
                if (conn.getResponseCode() != 200 || !"https".equals(conn.getURL().getProtocol())) {
                    throw new Exception("APK download failed");
                }
                long total = conn.getContentLengthLong();
                long loaded = 0;
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] buf = new byte[32 * 1024];
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(dest)) {
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        digest.update(buf, 0, n);
                        loaded += n;
                        JSObject progress = new JSObject();
                        progress.put("type", "progress");
                        progress.put("loaded", loaded);
                        progress.put("total", total);
                        call.resolve(progress);
                    }
                }
                if (expectedSha != null && !expectedSha.isEmpty()) {
                    StringBuilder hex = new StringBuilder();
                    for (byte b : digest.digest()) hex.append(String.format("%02x", b));
                    if (!hex.toString().equalsIgnoreCase(expectedSha)) {
                        dest.delete();
                        call.reject("SHA-256 mismatch");
                        return;
                    }
                }
                pendingApkFile = dest;
                pendingInstallCall = call;
                getActivity().runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && !getContext().getPackageManager().canRequestPackageInstalls()) {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                            .setData(Uri.parse("package:" + getContext().getPackageName()));
                        startActivityForResult(call, intent, "installPermissionResult");
                    } else {
                        launchInstaller(dest, call);
                    }
                });
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage());
            }
        }).start();
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        PluginCall pending = call != null ? call : pendingInstallCall;
        File apk = pendingApkFile;
        pendingInstallCall = null;
        pendingApkFile = null;
        if (pending == null) return;
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        if (!allowed) {
            pending.reject("Install permission denied");
        } else if (apk == null || !apk.isFile()) {
            pending.reject("APK file lost");
        } else {
            launchInstaller(apk, pending);
        }
    }

    private void launchInstaller(File apk, PluginCall call) {
        Context context = getContext();
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        JSObject done = new JSObject();
        done.put("type", "done");
        call.resolve(done);
        call.setKeepAlive(false);
    }
}
