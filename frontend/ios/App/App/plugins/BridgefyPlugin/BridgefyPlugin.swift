/**
 * Bridgefy Capacitor Plugin - iOS Implementation
 *
 * Wraps the Bridgefy SDK for use in Capacitor/Ionic apps.
 * Provides Bluetooth mesh networking for offline SOS delivery.
 */

import Foundation
import Capacitor

// Note: In production, uncomment the BridgefySDK import after adding via CocoaPods/SPM
// import BridgefySDK

@objc(BridgefyPlugin)
public class BridgefyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BridgefyPlugin"
    public let jsName = "Bridgefy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNearbyDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isBluetoothAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Properties

    // Note: Uncomment when BridgefySDK is added
    // private var bridgefy: Bridgefy?
    private var userId: String = ""
    private var isInitialized: Bool = false
    private var isRunning: Bool = false
    private var processedMessageIds: Set<String> = []
    private var connectedDevices: [[String: Any]] = []

    // MARK: - Initialize

    @objc func initialize(_ call: CAPPluginCall) {
        guard let apiKey = call.getString("apiKey"),
              let userId = call.getString("userId") else {
            call.reject("Missing required parameters: apiKey and userId")
            return
        }

        self.userId = userId

        let propagationProfile = call.getString("propagationProfile") ?? "standard"

        // TODO: Initialize actual Bridgefy SDK when added
        // do {
        //     let profile: PropagationProfile
        //     switch propagationProfile {
        //     case "long_reach": profile = .longReach
        //     case "short_reach": profile = .shortReach
        //     default: profile = .standard
        //     }
        //
        //     bridgefy = try Bridgefy(withApiKey: apiKey, delegate: self, propagationProfile: profile)
        //     isInitialized = true
        //
        //     call.resolve([
        //         "success": true,
        //         "userId": userId,
        //         "sdkVersion": Bridgefy.sdkVersion
        //     ])
        // } catch {
        //     call.reject("Failed to initialize Bridgefy: \(error.localizedDescription)")
        // }

        // Placeholder implementation until SDK is added
        isInitialized = true
        call.resolve([
            "success": true,
            "userId": userId,
            "sdkVersion": "placeholder-2.0.0"
        ])
    }

    // MARK: - Start/Stop

    @objc func start(_ call: CAPPluginCall) {
        guard isInitialized else {
            call.reject("Bridgefy not initialized. Call initialize() first.")
            return
        }

        // TODO: Start actual Bridgefy SDK
        // bridgefy?.start(withUserId: userId)

        isRunning = true

        // Notify status change
        notifyListeners("meshStatusChanged", data: [
            "isRunning": true,
            "isConnected": false,
            "nearbyDeviceCount": 0,
            "userId": userId
        ])

        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        // TODO: Stop actual Bridgefy SDK
        // bridgefy?.stop()

        isRunning = false
        connectedDevices = []

        notifyListeners("meshStatusChanged", data: [
            "isRunning": false,
            "isConnected": false,
            "nearbyDeviceCount": 0,
            "userId": userId
        ])

        call.resolve()
    }

    // MARK: - Send Message

    @objc func send(_ call: CAPPluginCall) {
        guard isRunning else {
            call.reject("Bridgefy not running. Call start() first.")
            return
        }

        guard let messageId = call.getString("messageId"),
              let content = call.getString("content"),
              let target = call.getString("target") else {
            call.reject("Missing required parameters: messageId, content, target")
            return
        }

        let ttl = call.getInt("ttl") ?? 15

        // TODO: Send via actual Bridgefy SDK
        // do {
        //     if target == "broadcast" {
        //         try bridgefy?.send(content.data(using: .utf8)!, transmissionMode: .broadcast)
        //     } else if let targetUserId = call.getString("targetUserId") {
        //         try bridgefy?.send(content.data(using: .utf8)!, transmissionMode: .p2p(userId: targetUserId))
        //     }
        // } catch {
        //     call.reject("Failed to send: \(error.localizedDescription)")
        //     return
        // }

        // Placeholder: Simulate successful queue
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.notifyListeners("messageSent", data: [
                "messageId": messageId
            ])
        }

        call.resolve([
            "messageId": messageId,
            "queued": true
        ])
    }

    // MARK: - Status

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve([
            "isRunning": isRunning,
            "isConnected": !connectedDevices.isEmpty,
            "nearbyDeviceCount": connectedDevices.count,
            "userId": userId
        ])
    }

    @objc func getNearbyDevices(_ call: CAPPluginCall) {
        call.resolve([
            "count": connectedDevices.count,
            "devices": connectedDevices
        ])
    }

    // MARK: - Bluetooth

    @objc func isBluetoothAvailable(_ call: CAPPluginCall) {
        // In production, check CBCentralManager state
        call.resolve([
            "available": true,
            "enabled": true
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        // iOS permissions are handled via Info.plist
        // The system will prompt when we try to use Bluetooth
        call.resolve([
            "bluetooth": "granted",
            "location": "granted"
        ])
    }
}

// MARK: - Bridgefy Delegate

// Note: Uncomment when BridgefySDK is added
// extension BridgefyPlugin: BridgefyDelegate {
//
//     public func bridgefyDidStart(with userId: String) {
//         isRunning = true
//         notifyListeners("meshStatusChanged", data: [
//             "isRunning": true,
//             "isConnected": false,
//             "nearbyDeviceCount": 0,
//             "userId": userId
//         ])
//     }
//
//     public func bridgefyDidStop() {
//         isRunning = false
//         connectedDevices = []
//         notifyListeners("meshStatusChanged", data: [
//             "isRunning": false,
//             "isConnected": false,
//             "nearbyDeviceCount": 0,
//             "userId": userId
//         ])
//     }
//
//     public func bridgefyDidConnect(toPeer peerUserId: String) {
//         let device: [String: Any] = [
//             "deviceId": peerUserId,
//             "userId": peerUserId,
//             "lastSeen": Date().timeIntervalSince1970 * 1000
//         ]
//         connectedDevices.append(device)
//
//         notifyListeners("deviceConnected", data: device)
//         notifyListeners("meshStatusChanged", data: [
//             "isRunning": true,
//             "isConnected": true,
//             "nearbyDeviceCount": connectedDevices.count,
//             "userId": userId
//         ])
//     }
//
//     public func bridgefyDidDisconnect(fromPeer peerUserId: String) {
//         connectedDevices.removeAll { ($0["userId"] as? String) == peerUserId }
//
//         notifyListeners("deviceDisconnected", data: [
//             "deviceId": peerUserId,
//             "userId": peerUserId,
//             "lastSeen": Date().timeIntervalSince1970 * 1000
//         ])
//         notifyListeners("meshStatusChanged", data: [
//             "isRunning": true,
//             "isConnected": !connectedDevices.isEmpty,
//             "nearbyDeviceCount": connectedDevices.count,
//             "userId": userId
//         ])
//     }
//
//     public func bridgefyDidReceiveData(
//         _ data: Data,
//         fromPeer peerUserId: String,
//         messageId: String,
//         transmissionMode: TransmissionMode,
//         hops: Int
//     ) {
//         // Deduplication
//         guard !processedMessageIds.contains(messageId) else { return }
//         processedMessageIds.insert(messageId)
//
//         // Limit cache size
//         if processedMessageIds.count > 1000 {
//             if let first = processedMessageIds.first {
//                 processedMessageIds.remove(first)
//             }
//         }
//
//         guard let content = String(data: data, encoding: .utf8) else { return }
//
//         notifyListeners("messageReceived", data: [
//             "messageId": messageId,
//             "senderId": peerUserId,
//             "content": content,
//             "receivedAt": Date().timeIntervalSince1970 * 1000,
//             "hops": hops
//         ])
//     }
//
//     public func bridgefyDidSendData(messageId: String) {
//         notifyListeners("messageSent", data: [
//             "messageId": messageId
//         ])
//     }
//
//     public func bridgefyDidFailSendingData(messageId: String, error: Error) {
//         notifyListeners("messageFailedToSend", data: [
//             "messageId": messageId,
//             "error": error.localizedDescription
//         ])
//     }
//
//     public func bridgefyDidFailWithError(_ error: Error) {
//         print("Bridgefy error: \(error.localizedDescription)")
//     }
// }
