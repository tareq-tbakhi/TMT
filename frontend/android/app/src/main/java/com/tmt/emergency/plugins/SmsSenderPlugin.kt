/**
 * SmsSender Capacitor Plugin - Android Implementation
 *
 * Sends SMS silently in the background using Android's SmsManager.
 * Used for offline SOS delivery when internet is unavailable but cellular is.
 * No user interaction required — the SMS is sent directly from the app.
 */

package com.tmt.emergency.plugins

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.app.ActivityCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "SmsSender",
    permissions = [
        Permission(
            strings = [Manifest.permission.SEND_SMS],
            alias = "sms"
        )
    ]
)
class SmsSenderPlugin : Plugin() {

    // ─── Send SMS ─────────────────────────────────────────────────

    @PluginMethod
    fun send(call: PluginCall) {
        val phoneNumber = call.getString("phoneNumber")
        val message = call.getString("message")

        if (phoneNumber.isNullOrEmpty() || message.isNullOrEmpty()) {
            call.reject("Missing required parameters: phoneNumber and message")
            return
        }

        // Check permission
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            call.reject("SEND_SMS permission not granted")
            return
        }

        try {
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            // Set up sent intent to track delivery
            val sentAction = "SMS_SENT_${System.currentTimeMillis()}"
            val sentIntent = PendingIntent.getBroadcast(
                context, 0,
                Intent(sentAction),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
            )

            // Register receiver for send result
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    try {
                        context.unregisterReceiver(this)
                    } catch (_: Exception) {}

                    val result = JSObject()
                    result.put("phoneNumber", phoneNumber)

                    when (resultCode) {
                        Activity.RESULT_OK -> {
                            result.put("success", true)
                            call.resolve(result)
                        }
                        else -> {
                            result.put("success", false)
                            result.put("errorCode", resultCode)
                            call.reject("SMS send failed with code: $resultCode")
                        }
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(
                    receiver, IntentFilter(sentAction), Context.RECEIVER_NOT_EXPORTED
                )
            } else {
                context.registerReceiver(receiver, IntentFilter(sentAction))
            }

            // Handle multi-part messages (encrypted SOS can exceed 160 chars)
            val parts = smsManager.divideMessage(message)
            if (parts.size == 1) {
                smsManager.sendTextMessage(phoneNumber, null, message, sentIntent, null)
            } else {
                val sentIntents = ArrayList<PendingIntent>()
                sentIntents.add(sentIntent)
                // Only track the first part; rest fire-and-forget
                for (i in 1 until parts.size) {
                    sentIntents.add(
                        PendingIntent.getBroadcast(
                            context, i,
                            Intent("SMS_PART_${i}_${System.currentTimeMillis()}"),
                            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
                        )
                    )
                }
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null)
            }
        } catch (e: Exception) {
            call.reject("Failed to send SMS: ${e.message}")
        }
    }

    // ─── Check if SMS is available ────────────────────────────────

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val hasPermission = ActivityCompat.checkSelfPermission(
            context, Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        val hasTelephony = context.packageManager.hasSystemFeature(
            android.content.pm.PackageManager.FEATURE_TELEPHONY
        )

        val result = JSObject()
        result.put("available", hasTelephony)
        result.put("permitted", hasPermission)
        call.resolve(result)
    }

    // ─── Permissions ──────────────────────────────────────────────

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        requestPermissionForAlias("sms", call, "smsPermissionCallback")
    }

    @PermissionCallback
    private fun smsPermissionCallback(call: PluginCall) {
        val granted = ActivityCompat.checkSelfPermission(
            context, Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        val result = JSObject()
        result.put("sms", if (granted) "granted" else "denied")
        call.resolve(result)
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val granted = ActivityCompat.checkSelfPermission(
            context, Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        val result = JSObject()
        result.put("sms", if (granted) "granted" else "prompt")
        call.resolve(result)
    }
}
