package com.bangumi.classtimetable

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.net.HttpURLConnection
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Only published releases of our repository; JS cannot provide a package URL. */
class AndroidUpdater(private val activity: Activity) {
    companion object {
        private const val REPO = "MASUKA2018/Bangumi_ClassTimeTable"
        private const val MAX_APK = 100L * 1024 * 1024
        private val busy = AtomicBoolean(false)
    }
    private fun connection(url: String): HttpURLConnection {
        var current = URL(url)
        repeat(6) {
            require(current.protocol == "https" && current.host in setOf("api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")) { "更新下载地址不受支持" }
            val c = (current.openConnection() as HttpURLConnection).apply {
                connectTimeout = 30000; readTimeout = 60000; instanceFollowRedirects = false
                setRequestProperty("User-Agent", "Bangumi-Timetable-Android")
                setRequestProperty("Cache-Control", "no-cache")
            }
            if (c.responseCode in listOf(301,302,303,307,308)) {
                val next = c.getHeaderField("Location") ?: error("下载重定向无效")
                current = URL(current, next); c.disconnect()
            } else {
                if (c.responseCode != 200) { val status = c.responseCode; c.disconnect(); error("更新请求失败：HTTP $status，请稍后重试") }
                return c
            }
        }
        error("下载重定向过多")
    }
    private fun text(url: String): String {
        val c = connection(url)
        try { return c.inputStream.use { input ->
            val out = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val n = input.read(buffer); if (n < 0) break
                require(out.size() + n <= 1024 * 1024) { "更新清单过大" }; out.write(buffer,0,n)
            }
            out.toString("UTF-8")
        } } finally { c.disconnect() }
    }
    @Suppress("DEPRECATION")
    private fun installed() = activity.packageManager.getPackageInfo(activity.packageName, PackageManager.GET_SIGNATURES)
    private fun numbers(v: String): List<Int> {
        require(v.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))) { "更新版本无效" }
        return v.split('.').map { it.toInt() }
    }
    private fun release(): JSONObject? {
        val doc = JSONObject(text("https://api.github.com/repos/$REPO/releases/latest"))
        require(!doc.getBoolean("draft") && !doc.getBoolean("prerelease"))
        val version = doc.getString("tag_name").removePrefix("client-v")
        val incoming = numbers(version); val current = numbers(installed().versionName ?: "0.0.0")
        val newer = incoming.zip(current).firstOrNull { it.first != it.second }?.let { it.first > it.second } ?: false
        if (!newer) return null
        val file = "bangumi-timetable-$version-android-arm64-release.apk"
        val assets = doc.getJSONArray("assets")
        val asset = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.getString("name") == file }
            ?: return null // Desktop-only releases are not Android updates.
        require(asset.getLong("size") in 1..MAX_APK)
        return JSONObject().put("version",version).put("body",doc.optString("body"))
            .put("date",doc.optString("published_at")).put("size",asset.getLong("size")).put("file",file)
    }
    fun check(invoke: Invoke) {
        Thread {
            try {
                val r = release()
                if (r == null) invoke.resolve() else invoke.resolve(JSObject().put("version",r.getString("version")).put("body",r.getString("body")).put("date",r.getString("date")) as JSObject)
            } catch (e: Exception) { invoke.reject(e.message ?: "检查更新失败") }
        }.start()
    }
    @Suppress("DEPRECATION")
    private fun verifyApk(file: File, version: String) {
        val pm = activity.packageManager
        val archive = pm.getPackageArchiveInfo(file.absolutePath, PackageManager.GET_SIGNATURES) ?: error("安装包无效")
        val local = installed()
        require(archive.packageName == activity.packageName && archive.versionName == version) { "安装包名称或版本不匹配" }
        val code = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
        val localCode = if (Build.VERSION.SDK_INT >= 28) local.longVersionCode else local.versionCode.toLong()
        require(code > localCode) { "安装包版本不是更新版本" }
        fun certs(info: android.content.pm.PackageInfo) = info.signatures?.map { it.toCharsString() }?.toSet()
        val expected = certs(local)
        require(!expected.isNullOrEmpty() && certs(archive) == expected) { "安装包签名与当前应用不一致" }
    }
    fun install(invoke: Invoke, expectedVersion: String) {
        if (!busy.compareAndSet(false,true)) { invoke.reject("更新已经在进行"); return }
        Thread {
            var partial: File? = null
            try {
                val r = release() ?: error("没有可安装的安卓更新，请重新检查")
                val version = r.getString("version")
                require(version == expectedVersion) { "更新版本已变化，请重新检查" }
                if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
                    activity.runOnUiThread {
                        try {
                            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.packageName)))
                            invoke.resolveObject("permission-required")
                        } catch (_: Exception) { invoke.reject("无法打开安装权限设置，请从下载页面手动安装") }
                    }
                    return@Thread
                }
                val root = "https://github.com/$REPO/releases/download/client-v$version/"
                val name = r.getString("file")
                val hashes = text(root + "SHA256SUMS.txt").lineSequence().map { it.trim().split(Regex("\\s+"),limit=2) }
                val hash = hashes.firstOrNull { it.size == 2 && it[1] == name }?.get(0) ?: error("发布包缺少校验值")
                require(hash.matches(Regex("[0-9a-fA-F]{64}")))
                val folder = File(activity.cacheDir,"updates").apply { mkdirs() }
                folder.listFiles()?.forEach { it.delete() }
                val file = File(folder,"update.apk.part"); partial = file
                val digest = MessageDigest.getInstance("SHA-256")
                val c = connection(root + name + "?download=1")
                var size = 0L
                try { c.inputStream.use { input -> file.outputStream().use { output ->
                    val buffer = ByteArray(65536)
                    while (true) {
                        val count = input.read(buffer); if (count < 0) break
                        size += count; require(size <= MAX_APK && size <= r.getLong("size")) { "安装包大小异常" }
                        digest.update(buffer,0,count); output.write(buffer,0,count)
                    }
                } } } finally { c.disconnect() }
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                require(size == r.getLong("size") && actual.equals(hash,true)) { "安装包校验失败，请重试下载" }
                verifyApk(file,version)
                val apk = File(folder,"update.apk"); require(file.renameTo(apk)); partial = null
                activity.runOnUiThread {
                    try {
                        val uri = FileProvider.getUriForFile(activity,activity.packageName + ".fileprovider",apk)
                        activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri,"application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            clipData = android.content.ClipData.newRawUri("update.apk",uri)
                        })
                        invoke.resolveObject("installer-opened")
                    } catch (_: Exception) { invoke.reject("无法启动系统安装器，请从下载页面手动安装") }
                }
            } catch (e: Exception) { invoke.reject(e.message ?: "下载更新失败") }
            finally { partial?.delete(); busy.set(false) }
        }.start()
    }
}
