package com.bangumi.classtimetable

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.notification.NOTIFICATION_OBJ_INTENT_KEY
import org.json.JSONObject
import java.io.File

@InvokeArg
class ExportTextArgs {
    lateinit var name: String
    lateinit var text: String
    lateinit var mime: String
}
@TauriPlugin
class MobileToolsPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun consumeLaunch(invoke: Invoke) {
        val raw = activity.intent?.getStringExtra(NOTIFICATION_OBJ_INTENT_KEY)
        activity.intent?.removeExtra(NOTIFICATION_OBJ_INTENT_KEY)
        try {
            val id = raw?.let { JSONObject(it).optJSONObject("extra")?.optInt("showId", 0) } ?: 0
            if (id > 0) invoke.resolveObject(id) else invoke.resolve()
        } catch (_: Exception) { invoke.resolve() }
    }
    @Command
    fun exportText(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ExportTextArgs::class.java)
            require(args.name.matches(Regex("[A-Za-z0-9_.-]{1,120}")))
            val folder = File(activity.cacheDir, "exports").apply { mkdirs() }
            val file = File(folder, args.name)
            file.writeText(args.text, Charsets.UTF_8)
            folder.listFiles()?.sortedByDescending { it.lastModified() }?.drop(10)?.forEach { it.delete() }
            val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = args.mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                clipData = android.content.ClipData.newRawUri(args.name, uri)
            }
            activity.startActivity(Intent.createChooser(intent, args.name))
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("Unable to export file") }
    }
    @Command
    fun reminderSettings(invoke: Invoke) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= 31) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + activity.packageName))
                else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
            activity.startActivity(intent)
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("Unable to open reminder settings") }
    }
}
