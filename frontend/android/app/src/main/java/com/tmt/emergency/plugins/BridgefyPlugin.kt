/**
 * Bridgefy Capacitor Plugin - Android Implementation
 *
 * Wraps the Bridgefy SDK for use in Capacitor/Ionic apps.
 * Provides Bluetooth mesh networking for offline SOS delivery.
 */

package com.tmt.emergency.plugins

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.*
import java.util.concurrent.ConcurrentHashMap

// Note: Uncomment when Bridgefy SDK is added via Gradle
// import me.bridgefy.Bridgefy
// import me.bridgefy.commons.TransmissionMode
// import me.bridgefy.commons.listener.BridgefyDelegate
// import me.bridgefy.commons.propagation.PropagationProfile

@CapacitorPlugin(
    name = "Bridgefy",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.ACCESS_FINE_LOCATION
            ],
            alias = "bluetooth"
        )
    ]
)
class BridgefyPlugin : Plugin() {

    // Note: Uncomment when Bridgefy SDK is added
    // private var bridgefy: Bridgefy? = null

    private var userId: String = ""
    private var isInitialized: Boolean = false
    private var isRunning: Boolean = false
    private val processedMessageIds: MutableSet<String> = Collections.newSetFromMap(ConcurrentHashMap())
    private val connectedDevices: MutableList<JSObject> = mutableListOf()

    // ─── Initialize ───────────────────────────────────────────────

    @PluginMethod
    fun initialize(call: PluginCall) {
        val apiKey = call.getString("apiKey")
        val userId = call.getString("userId")

        if (apiKey.isNullOrEmpty() || userId.isNullOrEmpty()) {
            call.reject("Missing required parameters: apiKey and userId")
            return
        }

        this.userId = userId

        val propagationProfile = call.getString("propagationProfile") ?: "standard"

        // TODO: Initialize actual Bridgefy SDK when added via Gradle
        // try {
        //     val profile = when (propagationProfile) {
        //         "long_reach" -> PropagationProfile.LongReach
        //         "short_reach" -> PropagationProfile.ShortReach
        //         else -> PropagationProfile.Standard
        //     }
        //
        //     bridgefy = Bridgefy.Builder()
        //         .setApiKey(apiKey)
        //         .setDelegate(bridgefyDelegate)
        //         .setPropagationProfile(profile)
        //         .build(context)
        //
        //     isInitialized = true
        //
        //     val result = JSObject()
        //     result.put("success", true)
        //     result.put("userId", userId)
        //     result.put("sdkVersion", Bridgefy.SDK_VERSION)
        //     call.resolve(result)
        // } catch (e: Exception) {
        //     call.reject("Failed to initialize Bridgefy: ${e.message}")
        // }

        // Placeholder implementation until SDK is added
        isInitialized = true

        val result = JSObject()
        result.put("success", true)
        result.put("userId", userId)
        result.put("sdkVersion", "placeholder-2.0.0")
        call.resolve(result)
    }

    // ─── Start/Stop ───────────────────────────────────────────────

    @PluginMethod
    fun start(call: PluginCall) {
        if (!isInitialized) {
            call.reject("Bridgefy not initialized. Call initialize() first.")
            return
        }

        // TODO: Start actual Bridgefy SDK
        // bridgefy?.start(userId)

        isRunning = true

        val status = JSObject()
        status.put("isRunning", true)
        status.put("isConnected", false)
        status.put("nearbyDeviceCount", 0)
        status.put("userId", userId)
        notifyListeners("meshStatusChanged", status)

        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        // TODO: Stop actual Bridgefy SDK
        // bridgefy?.stop()

        isRunning = false
        connectedDevices.clear()

        val status = JSObject()
        status.put("isRunning", false)
        status.put("isConnected", false)
        status.put("nearbyDeviceCount", 0)
        status.put("userId", userId)
        notifyListeners("meshStatusChanged", status)

        call.resolve()
    }

    // ─── Send Message ─────────────────────────────────────────────

    @PluginMethod
    fun send(call: PluginCall) {
        if (!isRunning) {
            call.reject("Bridgefy not running. Call start() first.")
            return
        }

        val messageId = call.getString("messageId")
        val content = call.getString("content")
        val target = call.getString("target")

        if (messageId.isNullOrEmpty() || content.isNullOrEmpty() || target.isNullOrEmpty()) {
            call.reject("Missing required parameters: messageId, content, target")
            return
        }

        val ttl = call.getInt("ttl") ?: 15

        // TODO: Send via actual Bridgefy SDK
        // try {
        //     val transmissionMode = if (target == "broadcast") {
        //         TransmissionMode.Broadcast
        //     } else {
        //         val targetUserId = call.getString("targetUserId")
        //         if (!targetUserId.isNullOrEmpty()) {
        //             TransmissionMode.P2P(targetUserId)
        //         } else {
        //             TransmissionMode.Broadcast
        //         }
        //     }
        //
        //     bridgefy?.send(content.toByteArray(Charsets.UTF_8), transmissionMode)
        // } catch (e: Exception) {
        //     call.reject("Failed to send: ${e.message}")
        //     return
        // }

        // Placeholder: Simulate successful queue
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            val event = JSObject()
            event.put("messageId", messageId)
            notifyListeners("messageSent", event)
        }, 300)

        val result = JSObject()
        result.put("messageId", messageId)
        result.put("queued", true)
        call.resolve(result)
    }

    // ─── Status ───────────────────────────────────────────────────

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val result = JSObject()
        result.put("isRunning", isRunning)
        result.put("isConnected", connectedDevices.isNotEmpty())
        result.put("nearbyDeviceCount", connectedDevices.size)
        result.put("userId", userId)
        call.resolve(result)
    }

    @PluginMethod
    fun getNearbyDevices(call: PluginCall) {
        val devices = JSArray()
        connectedDevices.forEach { devices.put(it) }

        val result = JSObject()
        result.put("count", connectedDevices.size)
        result.put("devices", devices)
        call.resolve(result)
    }

    // ─── Bluetooth ────────────────────────────────────────────────

    @PluginMethod
    fun isBluetoothAvailable(call: PluginCall) {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val bluetoothAdapter = bluetoothManager?.adapter

        val available = bluetoothAdapter != null
        val enabled = bluetoothAdapter?.isEnabled == true

        val result = JSObject()
        result.put("available", available)
        result.put("enabled", enabled)
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetooth", call, "permissionCallback")
        } else {
            val result = JSObject()
            result.put("bluetooth", "granted")
            result.put("location", "granted")
            call.resolve(result)
        }
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val bluetoothState = if (getPermissionState("bluetooth") == PermissionState.GRANTED) {
            "granted"
        } else {
            "denied"
        }

        val result = JSObject()
        result.put("bluetooth", bluetoothState)
        result.put("location", "granted")
        call.resolve(result)
    }

    // ─── Bridgefy Delegate (uncomment when SDK is added) ──────────

    // private val bridgefyDelegate = object : BridgefyDelegate {
    //
    //     override fun onStarted(userId: String) {
    //         isRunning = true
    //         val status = JSObject()
    //         status.put("isRunning", true)
    //         status.put("isConnected", false)
    //         status.put("nearbyDeviceCount", 0)
    //         status.put("userId", userId)
    //         notifyListeners("meshStatusChanged", status)
    //     }
    //
    //     override fun onStopped() {
    //         isRunning = false
    //         connectedDevices.clear()
    //         val status = JSObject()
    //         status.put("isRunning", false)
    //         status.put("isConnected", false)
    //         status.put("nearbyDeviceCount", 0)
    //         status.put("userId", this@BridgefyPlugin.userId)
    //         notifyListeners("meshStatusChanged", status)
    //     }
    //
    //     override fun onConnectedToPeer(peerUserId: String) {
    //         val device = JSObject()
    //         device.put("deviceId", peerUserId)
    //         device.put("userId", peerUserId)
    //         device.put("lastSeen", System.currentTimeMillis())
    //         connectedDevices.add(device)
    //
    //         notifyListeners("deviceConnected", device)
    //
    //         val status = JSObject()
    //         status.put("isRunning", true)
    //         status.put("isConnected", true)
    //         status.put("nearbyDeviceCount", connectedDevices.size)
    //         status.put("userId", this@BridgefyPlugin.userId)
    //         notifyListeners("meshStatusChanged", status)
    //     }
    //
    //     override fun onDisconnectedFromPeer(peerUserId: String) {
    //         connectedDevices.removeAll { it.getString("userId") == peerUserId }
    //
    //         val device = JSObject()
    //         device.put("deviceId", peerUserId)
    //         device.put("userId", peerUserId)
    //         device.put("lastSeen", System.currentTimeMillis())
    //         notifyListeners("deviceDisconnected", device)
    //
    //         val status = JSObject()
    //         status.put("isRunning", true)
    //         status.put("isConnected", connectedDevices.isNotEmpty())
    //         status.put("nearbyDeviceCount", connectedDevices.size)
    //         status.put("userId", this@BridgefyPlugin.userId)
    //         notifyListeners("meshStatusChanged", status)
    //     }
    //
    //     override fun onReceivedData(
    //         data: ByteArray,
    //         fromPeer: String,
    //         messageId: String,
    //         transmissionMode: TransmissionMode,
    //         hops: Int
    //     ) {
    //         // Deduplication
    //         if (processedMessageIds.contains(messageId)) return
    //         processedMessageIds.add(messageId)
    //
    //         // Limit cache size
    //         if (processedMessageIds.size > 1000) {
    //             val iterator = processedMessageIds.iterator()
    //             repeat(100) { if (iterator.hasNext()) { iterator.next(); iterator.remove() } }
    //         }
    //
    //         val content = String(data, Charsets.UTF_8)
    //
    //         val event = JSObject()
    //         event.put("messageId", messageId)
    //         event.put("senderId", fromPeer)
    //         event.put("content", content)
    //         event.put("receivedAt", System.currentTimeMillis())
    //         event.put("hops", hops)
    //         notifyListeners("messageReceived", event)
    //     }
    //
    //     override fun onSentData(messageId: String) {
    //         val event = JSObject()
    //         event.put("messageId", messageId)
    //         notifyListeners("messageSent", event)
    //     }
    //
    //     override fun onFailedSendingData(messageId: String, error: Exception) {
    //         val event = JSObject()
    //         event.put("messageId", messageId)
    //         event.put("error", error.message ?: "Unknown error")
    //         notifyListeners("messageFailedToSend", event)
    //     }
    //
    //     override fun onFailedWithError(error: Exception) {
    //         // Log error
    //     }
    // }
}
