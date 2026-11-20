package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Over-the-air web bundles. download() fetches + verifies + unzips a bundle, activate() points the
 * WebView at it (Capacitor persists the path), confirm() marks it good once the new UI has booted.
 * If a launch never confirms, load() rolls back to the last good bundle (or the embedded one).
 * Installing a new APK discards every downloaded bundle, so native and web code never drift apart.
 */
@CapacitorPlugin(name = "WebBundle")
public class WebBundlePlugin extends Plugin {
    private static final String PREFS = "web_bundle";
    private static final Pattern VERSION = Pattern.compile("^[0-9A-Za-z.+-]{1,40}$");
    private static final long MAX_UNZIPPED = 150L * 1024 * 1024;
    private static final int MAX_ENTRIES = 5000;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private File root() {
        File dir = new File(getContext().getFilesDir(), "web-bundles");
        dir.mkdirs();
        return dir;
    }

    private File dirFor(String version) {
        return new File(root(), version);
    }

    private long nativeCode() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return PackageInfoCompat.getLongVersionCode(info);
        } catch (Exception e) {
            return -1;
        }
    }

    private void setCapacitorPath(String path) {
        getContext()
            .getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, path)
            .commit();
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursive(child);
        file.delete();
    }

    private String running = "";

    /** Runs before Capacitor restores its saved path, so a rollback here takes effect on this launch. */
    @Override
    public void load() {
        SharedPreferences p = prefs();
        long code = nativeCode();
        if (p.getLong("native_code", -1) != code) {
            // New APK: Capacitor resets its own path; drop our bundles and state.
            deleteRecursive(root());
            p.edit().clear().putLong("native_code", code).commit();
            return;
        }
        String state = p.getString("state", "");
        String active = p.getString("active", "");
        if ("staged".equals(state)) {
            // First launch of a staged bundle: it is on trial until the web layer calls confirm().
            p.edit().putString("state", "pending").commit();
            running = active;
        } else if ("pending".equals(state)) {
            // The previous launch of this bundle never confirmed: roll back.
            String good = p.getString("good", "");
            File goodDir = good.isEmpty() ? null : dirFor(good);
            boolean haveGood = goodDir != null && goodDir.isDirectory();
            setCapacitorPath(haveGood ? goodDir.getAbsolutePath() : "");
            p.edit()
                .putString("bad", active)
                .putString("active", haveGood ? good : "")
                .putString("state", haveGood ? "good" : "")
                .commit();
            if (!active.isEmpty()) deleteRecursive(dirFor(active));
            running = haveGood ? good : "";
        } else if ("good".equals(state)) {
            running = active;
        }
    }

    @PluginMethod
    public void current(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject out = new JSObject();
        out.put("running", running); // "" means the bundle embedded in the APK
        out.put("staged", "staged".equals(p.getString("state", "")) ? p.getString("active", "") : "");
        out.put("bad", p.getString("bad", ""));
        out.put("nativeCode", nativeCode());
        call.resolve(out);
    }

    /** JS params: { url, sha256, version }. Resolves { version } once the bundle is verified and unpacked. */
    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        final String expected = call.getString("sha256");
        final String version = call.getString("version");
        if (url == null || !url.startsWith("https://")) {
            call.reject("An https url is required");
            return;
        }
        if (expected == null || !expected.matches("^[0-9a-fA-F]{64}$")) {
            call.reject("A sha256 is required");
            return;
        }
        if (version == null || !VERSION.matcher(version).matches()) {
            call.reject("Invalid version");
            return;
        }
        new Thread(() -> {
            File zip = new File(getContext().getCacheDir(), "web-bundle.zip");
            File tmp = new File(root(), version + ".tmp");
            try {
                deleteRecursive(tmp);
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(60_000);
                conn.connect();
                if (conn.getResponseCode() != 200 || !"https".equals(conn.getURL().getProtocol())) {
                    throw new Exception("Bundle download failed");
                }
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] buf = new byte[32 * 1024];
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(zip)) {
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        digest.update(buf, 0, n);
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : digest.digest()) hex.append(String.format("%02x", b));
                if (!hex.toString().equalsIgnoreCase(expected)) throw new Exception("Bundle checksum mismatch");

                unzip(zip, tmp);
                if (!new File(tmp, "index.html").isFile()) throw new Exception("Bundle has no index.html");
                File dest = dirFor(version);
                deleteRecursive(dest);
                if (!tmp.renameTo(dest)) throw new Exception("Could not store bundle");
                JSObject out = new JSObject();
                out.put("version", version);
                call.resolve(out);
            } catch (Exception e) {
                deleteRecursive(tmp);
                call.reject(e.getMessage() == null ? "Bundle download failed" : e.getMessage());
            } finally {
                zip.delete();
            }
        }).start();
    }

    private void unzip(File zip, File target) throws Exception {
        target.mkdirs();
        String base = target.getCanonicalPath() + File.separator;
        long total = 0;
        int entries = 0;
        byte[] buf = new byte[32 * 1024];
        try (ZipInputStream in = new ZipInputStream(new java.io.FileInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (++entries > MAX_ENTRIES) throw new Exception("Bundle has too many files");
                File out = new File(target, entry.getName());
                if (!out.getCanonicalPath().startsWith(base)) throw new Exception("Unsafe path in bundle");
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                out.getParentFile().mkdirs();
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        total += n;
                        if (total > MAX_UNZIPPED) throw new Exception("Bundle is too large");
                        fos.write(buf, 0, n);
                    }
                }
            }
        }
    }

    /** Makes a downloaded bundle the one used from the next launch. Nothing reloads now. */
    @PluginMethod
    public void stage(PluginCall call) {
        String version = call.getString("version");
        if (version == null || !VERSION.matcher(version).matches()) {
            call.reject("Invalid version");
            return;
        }
        File dir = dirFor(version);
        if (!new File(dir, "index.html").isFile()) {
            call.reject("Bundle not downloaded");
            return;
        }
        prefs().edit().putString("active", version).putString("state", "staged").commit();
        setCapacitorPath(dir.getAbsolutePath());
        call.resolve();
    }

    /** Reloads the WebView into the staged bundle now (it is on trial until confirm()). */
    @PluginMethod
    public void applyStaged(PluginCall call) {
        SharedPreferences p = prefs();
        String version = p.getString("active", "");
        if (!"staged".equals(p.getString("state", "")) || version.isEmpty()) {
            call.reject("No staged bundle");
            return;
        }
        File dir = dirFor(version);
        if (!new File(dir, "index.html").isFile()) {
            call.reject("Staged bundle is missing");
            return;
        }
        p.edit().putString("state", "pending").commit();
        running = version;
        call.resolve();
        getBridge().setServerBasePath(dir.getAbsolutePath());
    }

    /** Called by the web layer once the UI has rendered; marks the active bundle good and prunes the rest. */
    @PluginMethod
    public void confirm(PluginCall call) {
        SharedPreferences p = prefs();
        String active = p.getString("active", "");
        if ("pending".equals(p.getString("state", "")) && !active.isEmpty()) {
            p.edit().putString("state", "good").putString("good", active).remove("bad").commit();
            File[] all = root().listFiles();
            if (all != null) for (File f : all) if (!f.getName().equals(active)) deleteRecursive(f);
        }
        call.resolve();
    }
}
