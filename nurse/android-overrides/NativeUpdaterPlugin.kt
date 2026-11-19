package __PACKAGE__

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

@CapacitorPlugin(name = "NativeUpdater")
class NativeUpdaterPlugin : Plugin() {

    companion object {
        private const val INSTALL_REQUEST_CODE = 9271
    }

    private var pendingApkFile: File? = null
    private var pendingInstallCall: PluginCall? = null

    /**
     * Download an APK from a signed URL, verify its SHA-256 and launch the system installer.
     *
     * JS params: { url: string, sha256: string, fileName: string }
     * Progress events: { type: "progress", loaded: number, total: number }
     * Completion event: { type: "done" }
     * Error: reject with message string
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    fun downloadAndInstall(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url is required")
        val expectedSha = call.getString("sha256")
        val fileName = call.getString("fileName") ?: "update.apk"
        call.setKeepAlive(true)

        thread(isDaemon = true) {
            try {
                val dir = File(context.cacheDir, "apk-update").also { it.mkdirs() }
                // Remove any stale download first.
                File(dir, fileName).delete()
                val dest = File(dir, fileName)

                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 15_000
                conn.readTimeout = 60_000
                conn.connect()
                val total = conn.contentLengthLong
                var loaded = 0L
                conn.inputStream.use { input ->
                    dest.outputStream().use { output ->
                        val buf = ByteArray(32 * 1024)
                        var n: Int
                        while (input.read(buf).also { n = it } != -1) {
                            output.write(buf, 0, n)
                            loaded += n
                            val progress = JSObject()
                            progress.put("type", "progress")
                            progress.put("loaded", loaded)
                            progress.put("total", total)
                            call.resolve(progress)
                        }
                    }
                }

                if (expectedSha != null) {
                    val digest = MessageDigest.getInstance("SHA-256")
                    dest.inputStream().use { input ->
                        val buf = ByteArray(32 * 1024)
                        var n: Int
                        while (input.read(buf).also { n = it } != -1) digest.update(buf, 0, n)
                    }
                    val actual = digest.digest().joinToString("") { "%02x".format(it) }
                    if (!actual.equals(expectedSha, ignoreCase = true)) {
                        dest.delete()
                        return@thread call.reject("SHA-256 mismatch: expected $expectedSha got $actual")
                    }
                }

                pendingApkFile = dest
                pendingInstallCall = call

                activity.runOnUiThread {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                        !context.packageManager.canRequestPackageInstalls()
                    ) {
                        // Ask for the "install unknown apps" permission.
                        val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                            .setData(Uri.parse("package:${context.packageName}"))
                        startActivityForResult(call, intent, INSTALL_REQUEST_CODE)
                    } else {
                        launchInstaller(dest, call)
                    }
                }
            } catch (e: Exception) {
                call.reject(e.message ?: "Download failed")
            }
        }
    }

    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == INSTALL_REQUEST_CODE) {
            val call = pendingInstallCall ?: return
            val apk = pendingApkFile
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
                context.packageManager.canRequestPackageInstalls()
            ) {
                if (apk != null) launchInstaller(apk, call) else call.reject("APK file lost")
            } else {
                call.reject("Install permission denied")
            }
            pendingInstallCall = null
            pendingApkFile = null
        }
    }

    private fun launchInstaller(apk: File, call: PluginCall) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        val done = JSObject()
        done.put("type", "done")
        call.resolve(done)
        call.setKeepAlive(false)
    }
}
