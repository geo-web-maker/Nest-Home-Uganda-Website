package __PACKAGE__;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Explicit-package launcher used only for the two first-party Bloomwell apps. */
@CapacitorPlugin(name = "AppSwitch")
public class AppSwitchPlugin extends Plugin {
    private static final String ADMIN_PACKAGE = "__ADMIN_PACKAGE__";
    private static final String NURSE_PACKAGE = "__NURSE_PACKAGE__";

    private boolean allowedPackage(String value) {
        return ADMIN_PACKAGE.equals(value) || NURSE_PACKAGE.equals(value);
    }

    private boolean validScheme(String packageName, String scheme) {
        return (ADMIN_PACKAGE.equals(packageName) && "nhc-admin".equals(scheme))
            || (NURSE_PACKAGE.equals(packageName) && "nhc-nurse".equals(scheme));
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        String packageName = call.getString("package");
        if (packageName == null || !allowedPackage(packageName)) {
            call.reject("Unsupported application package", "invalid_package");
            return;
        }
        boolean installed;
        try {
            getContext().getPackageManager().getPackageInfo(packageName, 0);
            installed = true;
        } catch (PackageManager.NameNotFoundException error) {
            installed = false;
        }
        JSObject result = new JSObject();
        result.put("installed", installed);
        call.resolve(result);
    }

    private String schemeForPackage(String packageName) {
        if (ADMIN_PACKAGE.equals(packageName)) return "nhc-admin";
        if (NURSE_PACKAGE.equals(packageName)) return "nhc-nurse";
        return null;
    }

    @PluginMethod
    public void requestHandoff(PluginCall call) {
        String packageName = call.getString("package");
        String scheme = call.getString("scheme");
        String challenge = call.getString("challenge");
        String returnScheme = call.getString("returnScheme");
        String callerPackage = getContext().getPackageName();
        String expectedReturnScheme = schemeForPackage(callerPackage);
        if (packageName == null || !allowedPackage(packageName) || scheme == null || !validScheme(packageName, scheme)
            || returnScheme == null || !returnScheme.equals(expectedReturnScheme) || packageName.equals(callerPackage)) {
            call.reject("Unsupported handoff request destination", "invalid_destination");
            return;
        }
        if (challenge == null || !challenge.matches("[A-Za-z0-9_-]{43}")) {
            call.reject("Invalid sign-in challenge", "invalid_challenge");
            return;
        }
        Uri uri = Uri.parse(scheme + "://request-handoff?challenge=" + Uri.encode(challenge)
            + "&return_scheme=" + Uri.encode(returnScheme));
        Intent intent = new Intent(Intent.ACTION_VIEW, uri)
            .setPackage(packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (ActivityNotFoundException error) {
            call.reject("The other app is not installed", "not_installed");
        } catch (Exception error) {
            call.reject("The other app could not be opened", "launch_failed");
        }
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String packageName = call.getString("package");
        String scheme = call.getString("scheme");
        String code = call.getString("code", "");
        if (packageName == null || !allowedPackage(packageName) || scheme == null || !validScheme(packageName, scheme)) {
            call.reject("Unsupported application destination", "invalid_destination");
            return;
        }
        if (code == null || (!code.isEmpty() && !code.matches("[A-Za-z0-9_-]{20,100}"))) {
            call.reject("Invalid sign-in code", "invalid_code");
            return;
        }
        Uri uri = Uri.parse(scheme + "://handoff" + (code.isEmpty() ? "" : "?code=" + Uri.encode(code)));
        Intent intent = new Intent(Intent.ACTION_VIEW, uri)
            .setPackage(packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (ActivityNotFoundException error) {
            call.reject("The other app is not installed", "not_installed");
        } catch (Exception error) {
            call.reject("The other app could not be opened", "launch_failed");
        }
    }
}
