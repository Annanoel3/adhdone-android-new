# ============================================================================
# ADHDone R8 / ProGuard rules
#
# Several dependencies already ship consumer rules that are applied
# automatically; those are noted below so we do not duplicate them. What is
# added here is (a) our own classes, which have no consumer rules, and
# (b) the WebView / reflection cases R8 cannot see.
# ============================================================================

# ---------------------------------------------------------------------------
# Attributes
# ---------------------------------------------------------------------------
# Capacitor dispatches plugin calls via annotations, so annotation metadata
# must survive. Signature/InnerClasses/EnclosingMethod keep generics and
# anonymous classes (e.g. the Kotlin Continuation in NotifyBridge) intact.
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions

# Readable crash reports. Keeps line numbers while still obfuscating names;
# deobfuscate with app/build/outputs/mapping/release/mapping.txt.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# WebView bridge
# ---------------------------------------------------------------------------
# The app is a WebView shell; anything exposed to JavaScript is called purely
# by name and is invisible to R8.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------------------------------------------------------------------------
# Capacitor
# ---------------------------------------------------------------------------
# NOTE: @capacitor/android already ships consumer rules that keep
# "public class * extends com.getcapacitor.Plugin { *; }" plus @CapacitorPlugin
# annotated classes and their @PluginMethod / @ActivityCallback /
# @PermissionCallback methods. These are belt-and-braces for the bridge itself.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Plugins are looked up from assets/capacitor.plugins.json by classpath string.
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.community.** { *; }
-keep class com.tchvu3.capacitorvoicerecorder.** { *; }
-keep class io.ionic.libs.** { *; }

# ---------------------------------------------------------------------------
# Our own native code
# ---------------------------------------------------------------------------
# Registered via registerPlugin(), referenced from the manifest, or scheduled
# by WorkManager — all reflective entry points. None of these have consumer
# rules, so they are kept explicitly.
-keep class co.median.android.odxqpdy.** { *; }
-keepclassmembers class co.median.android.odxqpdy.** { *; }

# ---------------------------------------------------------------------------
# WorkManager
# ---------------------------------------------------------------------------
# NOTE: work-runtime ships consumer rules keeping "* extends Worker" and the
# ListenableWorker (Context, WorkerParameters) constructor. Repeated here
# because CaptureSyncWorker / QuickCaptureWorker are instantiated purely by
# class name and a silent failure would lose captures.
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**

# ---------------------------------------------------------------------------
# OneSignal
# ---------------------------------------------------------------------------
# NOTE: core / notifications / in-app-messages / location / otel ship their own
# consumer rules. kmp-release.aar and OneSignal-5.9.9.aar do not, hence this.
-keep class com.onesignal.** { *; }
-keep interface com.onesignal.** { *; }
-dontwarn com.onesignal.**

# ---------------------------------------------------------------------------
# Google Play Services / AdMob / Firebase
# ---------------------------------------------------------------------------
# REGRESSION FIX (v24): v23 enabled R8 and push registration stopped working.
# The OneSignal classes themselves were kept, but its *transitive* push
# dependencies were not: R8 removed 10 com.google.android.gms.cloudmessaging
# entries (renaming all 34 top-level classes) and 113
# com.google.android.datatransport entries. FCM token acquisition runs through
# gms.cloudmessaging, and Firebase delivers through datatransport, so with those
# shrunk the device never obtained a push token and never appeared in OneSignal.
#
# NARROWED (2026-09-23): the v24 fix kept ALL of com.google.android.gms, which
# is 9,000 of the app's 15,400 classes — 7,400 of them the AdMob SDK's internal
# package. That is why Play reports DEX optimization / obfuscation / shrinking
# at 18% (threshold 25%, deadline Feb 2027). The push path only needs the
# three packages named above, so only those (plus AdMob's public API) stay
# kept verbatim; AdMob's internals ship their own consumer rules and are meant
# to be shrunk like any other library.
-keep class com.google.android.gms.cloudmessaging.** { *; }
-keep class com.google.android.datatransport.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.android.datatransport.**
-dontwarn com.google.firebase.**

# ---------------------------------------------------------------------------
# Kotlin
# ---------------------------------------------------------------------------
# NotifyBridge implements kotlin.coroutines.Continuation for OneSignal's
# suspend-function bridge.
-keep class kotlin.coroutines.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn org.jetbrains.annotations.**

# REGRESSION FIX (v24): kotlin.coroutines above is the *stdlib* package and does
# nothing for kotlinx.coroutines, the coroutines library OneSignal 5.x is built
# on. In v23 R8 removed 752 kotlinx.coroutines entries and renamed all 99
# top-level classes.
-keep class kotlinx.coroutines.** { *; }
-keepnames class kotlinx.coroutines.**
-dontwarn kotlinx.coroutines.**

# ---------------------------------------------------------------------------
# JSON / enums
# ---------------------------------------------------------------------------
# org.json is used with explicit string keys (no reflective field mapping), but
# enum valueOf/values() are resolved by name and must not be stripped.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-dontwarn org.json.**

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
-dontwarn androidx.**
-dontwarn com.google.common.**
