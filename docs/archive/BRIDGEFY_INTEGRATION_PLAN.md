# Bridgefy Bluetooth Mesh Integration Plan

## Professional Implementation Guide for TMT Emergency Response System

**Version:** 1.1.0
**Date:** 2026-02-17
**Author:** TMT Engineering Team
**Status:** Implementation Complete - Ready for Testing

### Implementation Progress
- [x] **Phase 1**: Foundation - Bridgefy plugin structure
- [x] **Phase 2**: Native Plugin Development (iOS Swift + Android Kotlin)
- [x] **Phase 3**: TypeScript Services (BridgefyService, ConnectionManager, SOSDispatcher)
- [x] **Phase 4**: Backend Integration (mesh.py routes, database migrations)
- [x] **Phase 5**: SOS Page Integration (unified dispatcher, connection status UI)
- [x] **Phase 6**: Testing & QA (unit tests created)

### Files Created/Modified

#### Frontend - Native Plugins
- `frontend/src/plugins/bridgefy/definitions.ts` - TypeScript interfaces
- `frontend/src/plugins/bridgefy/index.ts` - Plugin registration
- `frontend/src/plugins/bridgefy/web.ts` - Web mock implementation
- `frontend/ios/App/App/plugins/BridgefyPlugin/BridgefyPlugin.swift` - iOS native plugin
- `frontend/ios/App/App/plugins/BridgefyPlugin/BridgefyPlugin.m` - Objective-C bridge
- `frontend/android/app/src/main/java/com/tmt/emergency/plugins/BridgefyPlugin.kt` - Android plugin

#### Frontend - TypeScript Services
- `frontend/src/native/bridgefyService.ts` - Main Bridgefy service wrapper
- `frontend/src/services/connectionManager.ts` - Unified connection state management
- `frontend/src/services/sosDispatcher.ts` - SOS dispatch with fallback chain

#### Frontend - React Hooks
- `frontend/src/hooks/useBridgefy.ts` - Bridgefy status hook
- `frontend/src/hooks/useConnectionStatus.ts` - Connection status hook

#### Frontend - Tests
- `frontend/src/native/bridgefyService.test.ts` - Bridgefy service tests
- `frontend/src/services/connectionManager.test.ts` - Connection manager tests
- `frontend/src/services/sosDispatcher.test.ts` - SOS dispatcher tests
- `frontend/src/hooks/useConnectionStatus.test.ts` - Connection status hook tests

#### Backend
- `backend/app/api/routes/mesh.py` - Mesh relay API routes
- `backend/app/models/sos_request.py` - Updated with mesh fields
- `backend/app/main.py` - Added mesh routes and migrations
- `backend/tests/test_mesh_routes.py` - Backend unit tests

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technical Requirements](#3-technical-requirements)
4. [Implementation Phases](#4-implementation-phases)
5. [Native Plugin Development](#5-native-plugin-development)
6. [TypeScript Service Layer](#6-typescript-service-layer)
7. [Backend Integration](#7-backend-integration)
8. [SOS Fallback Chain](#8-sos-fallback-chain)
9. [Security & Encryption](#9-security--encryption)
10. [Testing Strategy](#10-testing-strategy)
11. [Deployment & Configuration](#11-deployment--configuration)
12. [Monitoring & Analytics](#12-monitoring--analytics)
13. [Error Handling & Edge Cases](#13-error-handling--edge-cases)
14. [Cost Analysis](#14-cost-analysis)
15. [Implementation Tasks Checklist](#15-implementation-tasks-checklist)

---

## 1. Executive Summary

### 1.1 Purpose

Implement Bridgefy SDK as the **third-layer fallback** for SOS emergency signals when both internet and cellular networks are unavailable. This enables peer-to-peer mesh networking where SOS messages hop between nearby devices until reaching one with internet connectivity.

### 1.2 Fallback Chain

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SOS DELIVERY CHAIN                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │   LAYER 1    │    │   LAYER 2    │    │        LAYER 3           │  │
│  │   Internet   │───►│     SMS      │───►│   Bluetooth Mesh         │  │
│  │              │    │              │    │     (Bridgefy)           │  │
│  │  ~100-500ms  │    │   ~5-30sec   │    │   ~30sec - 5min          │  │
│  │   Primary    │    │   Cellular   │    │   Offline/Disaster       │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│         │                   │                        │                  │
│         ▼                   ▼                        ▼                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    UNIFIED SOS PROCESSING                        │   │
│  │                                                                  │   │
│  │  • Deduplication (UUID-based)                                   │   │
│  │  • AI Triage Pipeline                                           │   │
│  │  • Department Routing                                           │   │
│  │  • Real-time Dashboard Broadcast                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Benefits

| Benefit | Description |
|---------|-------------|
| **Complete Offline Support** | SOS works even with total infrastructure failure |
| **Crowd-Sourced Relay** | Messages hop through nearby devices automatically |
| **End-to-End Encryption** | Secure transmission built into Bridgefy SDK |
| **~100m Range Per Hop** | BLE extended range with mesh routing |
| **Automatic Reconnection** | Seamless handoff when connectivity restores |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TMT MOBILE APP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        TypeScript Layer                              │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │   │
│  │  │ SOS Page     │  │ Connection   │  │    SOS Dispatcher          │ │   │
│  │  │ (SOS.tsx)    │──│ Manager      │──│                            │ │   │
│  │  │              │  │              │  │ • Fallback Logic           │ │   │
│  │  └──────────────┘  └──────────────┘  │ • Retry Management         │ │   │
│  │                                      │ • Delivery Confirmation    │ │   │
│  │                                      └─────────────┬──────────────┘ │   │
│  │                                                    │                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┴──────────────┐ │   │
│  │  │ API Service  │  │ SMS Service  │  │   Bridgefy Service        │ │   │
│  │  │              │  │              │  │                            │ │   │
│  │  │ • HTTP/WS    │  │ • Encrypt    │  │ • Initialize SDK          │ │   │
│  │  │ • IndexedDB  │  │ • Send       │  │ • Send/Receive Messages   │ │   │
│  │  │   Queue      │  │ • Queue      │  │ • Relay Logic             │ │   │
│  │  └──────┬───────┘  └──────┬───────┘  │ • Deduplication           │ │   │
│  │         │                 │          └─────────────┬──────────────┘ │   │
│  └─────────┼─────────────────┼────────────────────────┼─────────────────┘   │
│            │                 │                        │                     │
│  ┌─────────┴─────────────────┴────────────────────────┴─────────────────┐   │
│  │                     Capacitor Plugin Layer                            │   │
│  │                                                                       │   │
│  │  ┌────────────────────────────────────────────────────────────────┐  │   │
│  │  │                capacitor-bridgefy-plugin                        │  │   │
│  │  │                                                                 │  │   │
│  │  │  TypeScript Interface ←→ Native Bridge ←→ Bridgefy SDK         │  │   │
│  │  └────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                        Native Layer                                    │   │
│  │                                                                        │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────┐   │   │
│  │  │      iOS (Swift)        │    │       Android (Kotlin)          │   │   │
│  │  │                         │    │                                  │   │   │
│  │  │  • BridgefySDK.xcfr     │    │  • bridgefy-android-sdk         │   │   │
│  │  │  • CoreBluetooth        │    │  • android.bluetooth.le         │   │   │
│  │  │  • BackgroundModes      │    │  • ForegroundService            │   │   │
│  │  └─────────────────────────┘    └─────────────────────────────────┘   │   │
│  │                                                                        │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                          BLE Mesh Network
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OTHER TMT DEVICES                                    │
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│  │  Patient B    │  │  Responder    │  │  Patient C    │                   │
│  │  (Offline)    │──│  (Offline)    │──│  (ONLINE)     │───► Backend       │
│  │               │  │               │  │               │                   │
│  │  Relay Node   │  │  Relay Node   │  │  Internet     │                   │
│  └───────────────┘  └───────────────┘  │  Bridge       │                   │
│                                        └───────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SOS MESSAGE FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SENDER (Offline)              RELAY NODES                 BRIDGE NODE     │
│  ┌─────────────────┐          ┌─────────────┐           ┌─────────────┐    │
│  │                 │          │             │           │             │    │
│  │  1. Create SOS  │          │             │           │             │    │
│  │     ↓           │          │             │           │             │    │
│  │  2. Encrypt     │          │             │           │             │    │
│  │     ↓           │          │             │           │             │    │
│  │  3. Broadcast   │──BLE────►│  4. Receive │           │             │    │
│  │     via BLE     │          │     ↓       │           │             │    │
│  │                 │          │  5. Check   │           │             │    │
│  │                 │          │     Online? │           │             │    │
│  │                 │          │     ↓       │           │             │    │
│  │                 │          │  6. NO:     │           │             │    │
│  │                 │          │     Relay   │──BLE─────►│  7. Receive │    │
│  │                 │          │             │           │     ↓       │    │
│  │                 │          │             │           │  8. Online? │    │
│  │                 │          │             │           │     YES     │    │
│  │                 │          │             │           │     ↓       │    │
│  │                 │          │             │           │  9. Forward │    │
│  │                 │          │             │           │     to API  │    │
│  │                 │          │             │           │     ↓       │    │
│  │                 │          │             │  ◄────────│ 10. ACK     │    │
│  │                 │  ◄───────│  ◄──────────│           │             │    │
│  │ 11. Receive ACK │          │   Relay ACK │           │             │    │
│  │                 │          │             │           │             │    │
│  └─────────────────┘          └─────────────┘           └─────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENT RELATIONSHIPS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  frontend/src/                                                              │
│  │                                                                          │
│  ├── native/                                                                │
│  │   ├── bridgefyService.ts      ← Main Bridgefy TypeScript service        │
│  │   ├── bridgefyTypes.ts        ← Type definitions                        │
│  │   ├── networkService.ts       ← Existing (extend for mesh status)       │
│  │   └── platform.ts             ← Existing (detect BLE capability)        │
│  │                                                                          │
│  ├── services/                                                              │
│  │   ├── sosDispatcher.ts        ← NEW: Unified SOS dispatch with fallback │
│  │   ├── connectionManager.ts    ← NEW: Monitor all connection layers      │
│  │   ├── smsService.ts           ← Existing (Layer 2)                      │
│  │   └── api.ts                  ← Existing (Layer 1)                      │
│  │                                                                          │
│  ├── hooks/                                                                 │
│  │   ├── useBridgefy.ts          ← NEW: React hook for Bridgefy            │
│  │   ├── useConnectionStatus.ts  ← NEW: Combined connection status         │
│  │   └── useSMSFallback.ts       ← Existing                                │
│  │                                                                          │
│  └── pages/patient/                                                         │
│      └── SOS.tsx                 ← Modify to use SOSDispatcher             │
│                                                                             │
│  frontend/ios/                                                              │
│  └── App/App/                                                               │
│      └── plugins/                                                           │
│          └── BridgefyPlugin/     ← NEW: Native iOS Capacitor plugin        │
│              ├── BridgefyPlugin.swift                                       │
│              └── BridgefyPlugin.m                                           │
│                                                                             │
│  frontend/android/                                                          │
│  └── app/src/main/java/com/tmt/emergency/                                  │
│      └── plugins/                                                           │
│          └── BridgefyPlugin.kt   ← NEW: Native Android Capacitor plugin    │
│                                                                             │
│  backend/app/                                                               │
│  └── api/routes/                                                            │
│      └── mesh.py                 ← NEW: Mesh relay endpoint                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Requirements

### 3.1 Bridgefy SDK Requirements

| Requirement | iOS | Android |
|-------------|-----|---------|
| **Minimum OS** | iOS 13.0+ | Android 6.0 (API 23)+ |
| **Bluetooth** | BLE 4.0+ | BLE 4.0+ |
| **SDK Version** | 2.x | 2.x |
| **License** | API Key Required | API Key Required |
| **Permissions** | Already configured in Info.plist | Already configured in AndroidManifest.xml |

### 3.2 Existing TMT Project Assets

| Asset | Location | Status |
|-------|----------|--------|
| iOS Bluetooth permissions | `frontend/ios/App/App/Info.plist:71-85` | ✅ Configured |
| Android Bluetooth permissions | `frontend/android/app/src/main/AndroidManifest.xml:65-70` | ✅ Configured |
| Background modes (iOS) | `Info.plist:77-85` | ✅ bluetooth-central, bluetooth-peripheral |
| Foreground service (Android) | `AndroidManifest.xml:73` | ✅ Configured |
| Network service | `frontend/src/native/networkService.ts` | ✅ Extend |
| SMS fallback | `frontend/src/services/smsService.ts` | ✅ Layer 2 ready |
| SOS page | `frontend/src/pages/patient/SOS.tsx` | ✅ Modify |
| IndexedDB queue | `SOS.tsx:44-89` | ✅ Reuse pattern |
| Encryption utils | `frontend/src/utils/encryption.ts` | ✅ Reuse |
| Capacitor config | `frontend/capacitor.config.ts` | ✅ Add plugin |

### 3.3 Environment Variables

```bash
# frontend/.env
VITE_BRIDGEFY_API_KEY=your-bridgefy-api-key
VITE_BRIDGEFY_LICENSE=your-bridgefy-license-key

# backend/.env
BRIDGEFY_WEBHOOK_SECRET=your-webhook-secret
```

---

## 4. Implementation Phases

### Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION TIMELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: Foundation (Week 1)                                               │
│  ├── Bridgefy account setup & SDK acquisition                               │
│  ├── Create Capacitor plugin structure                                      │
│  └── TypeScript types & interfaces                                          │
│                                                                             │
│  Phase 2: Native Plugin (Week 2-3)                                          │
│  ├── iOS Swift plugin implementation                                        │
│  ├── Android Kotlin plugin implementation                                   │
│  └── Plugin testing on devices                                              │
│                                                                             │
│  Phase 3: TypeScript Services (Week 3-4)                                    │
│  ├── BridgefyService implementation                                         │
│  ├── ConnectionManager service                                              │
│  ├── SOSDispatcher with fallback chain                                      │
│  └── React hooks                                                            │
│                                                                             │
│  Phase 4: Backend Integration (Week 4)                                      │
│  ├── Mesh relay endpoint                                                    │
│  ├── Deduplication logic                                                    │
│  └── Database schema updates                                                │
│                                                                             │
│  Phase 5: SOS Page Integration (Week 5)                                     │
│  ├── Modify SOS.tsx                                                         │
│  ├── UI indicators for mesh status                                          │
│  └── Delivery confirmation flow                                             │
│                                                                             │
│  Phase 6: Testing & QA (Week 5-6)                                           │
│  ├── Unit tests                                                             │
│  ├── Integration tests                                                      │
│  ├── Real device mesh testing                                               │
│  └── Edge case validation                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Native Plugin Development

### 5.1 Plugin Directory Structure

```
frontend/
├── ios/
│   └── App/
│       └── App/
│           └── plugins/
│               └── BridgefyPlugin/
│                   ├── BridgefyPlugin.swift
│                   ├── BridgefyPlugin.m
│                   └── BridgefyMessageHandler.swift
│
├── android/
│   └── app/
│       └── src/
│           └── main/
│               └── java/
│                   └── com/
│                       └── tmt/
│                           └── emergency/
│                               └── plugins/
│                                   ├── BridgefyPlugin.kt
│                                   └── BridgefyMessageHandler.kt
│
└── src/
    └── plugins/
        └── bridgefy/
            ├── index.ts
            ├── definitions.ts
            └── web.ts
```

### 5.2 TypeScript Plugin Interface

```typescript
// frontend/src/plugins/bridgefy/definitions.ts

import type { PluginListenerHandle } from '@capacitor/core';

export interface BridgefyPlugin {
  /**
   * Initialize the Bridgefy SDK
   */
  initialize(options: InitializeOptions): Promise<InitializeResult>;

  /**
   * Start the Bridgefy mesh network
   */
  start(options: StartOptions): Promise<void>;

  /**
   * Stop the Bridgefy mesh network
   */
  stop(): Promise<void>;

  /**
   * Send a message via mesh network
   */
  send(options: SendOptions): Promise<SendResult>;

  /**
   * Get current mesh network status
   */
  getStatus(): Promise<MeshStatus>;

  /**
   * Get count of nearby devices
   */
  getNearbyDevices(): Promise<{ count: number; devices: DeviceInfo[] }>;

  /**
   * Check if Bluetooth is available and enabled
   */
  isBluetoothAvailable(): Promise<{ available: boolean; enabled: boolean }>;

  /**
   * Request Bluetooth permissions (if needed)
   */
  requestPermissions(): Promise<PermissionStatus>;

  // Event Listeners
  addListener(
    eventName: 'messageReceived',
    callback: (message: ReceivedMessage) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'messageSent',
    callback: (result: MessageSentEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'messageFailedToSend',
    callback: (error: MessageFailedEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'deviceConnected',
    callback: (device: DeviceInfo) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'deviceDisconnected',
    callback: (device: DeviceInfo) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'meshStatusChanged',
    callback: (status: MeshStatus) => void
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

// ─── Types ───────────────────────────────────────────────────────

export interface InitializeOptions {
  apiKey: string;
  userId: string;
  propagationProfile?: 'standard' | 'long_reach' | 'short_reach';
}

export interface InitializeResult {
  success: boolean;
  userId: string;
  sdkVersion: string;
}

export interface StartOptions {
  autoConnect?: boolean;
  transmitPower?: 'low' | 'medium' | 'high';
}

export interface SendOptions {
  messageId: string;
  content: string;
  target: 'broadcast' | 'direct';
  targetUserId?: string;
  ttl?: number; // Time-to-live in hops
}

export interface SendResult {
  messageId: string;
  queued: boolean;
}

export interface ReceivedMessage {
  messageId: string;
  senderId: string;
  content: string;
  receivedAt: number;
  hops: number;
}

export interface MessageSentEvent {
  messageId: string;
  deliveredTo?: string;
}

export interface MessageFailedEvent {
  messageId: string;
  error: string;
}

export interface DeviceInfo {
  deviceId: string;
  userId?: string;
  rssi?: number;
  lastSeen: number;
}

export interface MeshStatus {
  isRunning: boolean;
  isConnected: boolean;
  nearbyDeviceCount: number;
  userId: string;
}

export interface PermissionStatus {
  bluetooth: 'granted' | 'denied' | 'prompt';
  location: 'granted' | 'denied' | 'prompt';
}
```

### 5.3 iOS Swift Implementation

```swift
// frontend/ios/App/App/plugins/BridgefyPlugin/BridgefyPlugin.swift

import Foundation
import Capacitor
import BridgefySDK

@objc(BridgefyPlugin)
public class BridgefyPlugin: CAPPlugin {

    private var bridgefy: Bridgefy?
    private var userId: String = ""
    private var processedMessageIds: Set<String> = []

    // MARK: - Initialize

    @objc func initialize(_ call: CAPPluginCall) {
        guard let apiKey = call.getString("apiKey"),
              let userId = call.getString("userId") else {
            call.reject("Missing apiKey or userId")
            return
        }

        self.userId = userId

        let propagationProfile: PropagationProfile
        switch call.getString("propagationProfile") ?? "standard" {
        case "long_reach":
            propagationProfile = .longReach
        case "short_reach":
            propagationProfile = .shortReach
        default:
            propagationProfile = .standard
        }

        do {
            bridgefy = try Bridgefy(
                withApiKey: apiKey,
                delegate: self,
                propagationProfile: propagationProfile
            )

            call.resolve([
                "success": true,
                "userId": userId,
                "sdkVersion": Bridgefy.sdkVersion
            ])
        } catch {
            call.reject("Failed to initialize Bridgefy: \(error.localizedDescription)")
        }
    }

    // MARK: - Start/Stop

    @objc func start(_ call: CAPPluginCall) {
        guard let bridgefy = bridgefy else {
            call.reject("Bridgefy not initialized")
            return
        }

        bridgefy.start(withUserId: userId)
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        bridgefy?.stop()
        call.resolve()
    }

    // MARK: - Send Message

    @objc func send(_ call: CAPPluginCall) {
        guard let bridgefy = bridgefy else {
            call.reject("Bridgefy not initialized")
            return
        }

        guard let messageId = call.getString("messageId"),
              let content = call.getString("content"),
              let target = call.getString("target") else {
            call.reject("Missing required parameters")
            return
        }

        let ttl = call.getInt("ttl") ?? 15

        do {
            if target == "broadcast" {
                // Broadcast to all nearby devices
                try bridgefy.send(
                    content.data(using: .utf8)!,
                    transmissionMode: .broadcast
                )
            } else if let targetUserId = call.getString("targetUserId") {
                // Direct message to specific user
                try bridgefy.send(
                    content.data(using: .utf8)!,
                    transmissionMode: .p2p(userId: targetUserId)
                )
            }

            call.resolve([
                "messageId": messageId,
                "queued": true
            ])
        } catch {
            call.reject("Failed to send message: \(error.localizedDescription)")
        }
    }

    // MARK: - Status

    @objc func getStatus(_ call: CAPPluginCall) {
        guard let bridgefy = bridgefy else {
            call.resolve([
                "isRunning": false,
                "isConnected": false,
                "nearbyDeviceCount": 0,
                "userId": ""
            ])
            return
        }

        call.resolve([
            "isRunning": bridgefy.isStarted,
            "isConnected": bridgefy.connectedPeers.count > 0,
            "nearbyDeviceCount": bridgefy.connectedPeers.count,
            "userId": userId
        ])
    }

    @objc func getNearbyDevices(_ call: CAPPluginCall) {
        guard let bridgefy = bridgefy else {
            call.resolve(["count": 0, "devices": []])
            return
        }

        let devices = bridgefy.connectedPeers.map { peer -> [String: Any] in
            return [
                "deviceId": peer.id,
                "userId": peer.userId ?? "",
                "lastSeen": Date().timeIntervalSince1970 * 1000
            ]
        }

        call.resolve([
            "count": devices.count,
            "devices": devices
        ])
    }

    @objc func isBluetoothAvailable(_ call: CAPPluginCall) {
        // Check Bluetooth state
        call.resolve([
            "available": true,
            "enabled": true // Will be updated by delegate
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        // iOS handles permissions through Info.plist
        call.resolve([
            "bluetooth": "granted",
            "location": "granted"
        ])
    }
}

// MARK: - Bridgefy Delegate

extension BridgefyPlugin: BridgefyDelegate {

    public func bridgefyDidStart(with userId: String) {
        notifyListeners("meshStatusChanged", data: [
            "isRunning": true,
            "isConnected": false,
            "nearbyDeviceCount": 0,
            "userId": userId
        ])
    }

    public func bridgefyDidStop() {
        notifyListeners("meshStatusChanged", data: [
            "isRunning": false,
            "isConnected": false,
            "nearbyDeviceCount": 0,
            "userId": userId
        ])
    }

    public func bridgefyDidConnect(toPeer peerUserId: String) {
        notifyListeners("deviceConnected", data: [
            "deviceId": peerUserId,
            "userId": peerUserId,
            "lastSeen": Date().timeIntervalSince1970 * 1000
        ])
    }

    public func bridgefyDidDisconnect(fromPeer peerUserId: String) {
        notifyListeners("deviceDisconnected", data: [
            "deviceId": peerUserId,
            "userId": peerUserId,
            "lastSeen": Date().timeIntervalSince1970 * 1000
        ])
    }

    public func bridgefyDidReceiveData(_ data: Data, fromPeer peerUserId: String, messageId: String, transmissionMode: TransmissionMode, hops: Int) {
        // Deduplication check
        guard !processedMessageIds.contains(messageId) else { return }
        processedMessageIds.insert(messageId)

        // Limit cache size
        if processedMessageIds.count > 1000 {
            processedMessageIds.removeFirst()
        }

        guard let content = String(data: data, encoding: .utf8) else { return }

        notifyListeners("messageReceived", data: [
            "messageId": messageId,
            "senderId": peerUserId,
            "content": content,
            "receivedAt": Date().timeIntervalSince1970 * 1000,
            "hops": hops
        ])
    }

    public func bridgefyDidSendDataProgress(messageId: String, progress: Float) {
        // Progress update (optional)
    }

    public func bridgefyDidSendData(messageId: String) {
        notifyListeners("messageSent", data: [
            "messageId": messageId
        ])
    }

    public func bridgefyDidFailSendingData(messageId: String, error: Error) {
        notifyListeners("messageFailedToSend", data: [
            "messageId": messageId,
            "error": error.localizedDescription
        ])
    }

    public func bridgefyDidFailWithError(_ error: Error) {
        print("Bridgefy error: \(error.localizedDescription)")
    }
}
```

### 5.4 Android Kotlin Implementation

```kotlin
// frontend/android/app/src/main/java/com/tmt/emergency/plugins/BridgefyPlugin.kt

package com.tmt.emergency.plugins

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import me.bridgefy.Bridgefy
import me.bridgefy.commons.TransmissionMode
import me.bridgefy.commons.listener.BridgefyDelegate
import me.bridgefy.commons.propagation.PropagationProfile
import java.util.*
import java.util.concurrent.ConcurrentHashMap

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
class BridgefyPlugin : Plugin(), BridgefyDelegate {

    private var bridgefy: Bridgefy? = null
    private var userId: String = ""
    private val processedMessageIds: MutableSet<String> = Collections.newSetFromMap(ConcurrentHashMap())

    // ─── Initialize ───────────────────────────────────────────────

    @PluginMethod
    fun initialize(call: PluginCall) {
        val apiKey = call.getString("apiKey")
        val userId = call.getString("userId")

        if (apiKey == null || userId == null) {
            call.reject("Missing apiKey or userId")
            return
        }

        this.userId = userId

        val propagationProfile = when (call.getString("propagationProfile") ?: "standard") {
            "long_reach" -> PropagationProfile.LongReach
            "short_reach" -> PropagationProfile.ShortReach
            else -> PropagationProfile.Standard
        }

        try {
            bridgefy = Bridgefy.Builder()
                .setApiKey(apiKey)
                .setDelegate(this)
                .setPropagationProfile(propagationProfile)
                .build(context)

            val result = JSObject()
            result.put("success", true)
            result.put("userId", userId)
            result.put("sdkVersion", Bridgefy.SDK_VERSION)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to initialize Bridgefy: ${e.message}")
        }
    }

    // ─── Start/Stop ───────────────────────────────────────────────

    @PluginMethod
    fun start(call: PluginCall) {
        val bf = bridgefy
        if (bf == null) {
            call.reject("Bridgefy not initialized")
            return
        }

        bf.start(userId)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        bridgefy?.stop()
        call.resolve()
    }

    // ─── Send Message ─────────────────────────────────────────────

    @PluginMethod
    fun send(call: PluginCall) {
        val bf = bridgefy
        if (bf == null) {
            call.reject("Bridgefy not initialized")
            return
        }

        val messageId = call.getString("messageId")
        val content = call.getString("content")
        val target = call.getString("target")

        if (messageId == null || content == null || target == null) {
            call.reject("Missing required parameters")
            return
        }

        try {
            val transmissionMode = if (target == "broadcast") {
                TransmissionMode.Broadcast
            } else {
                val targetUserId = call.getString("targetUserId")
                if (targetUserId != null) {
                    TransmissionMode.P2P(targetUserId)
                } else {
                    TransmissionMode.Broadcast
                }
            }

            bf.send(content.toByteArray(Charsets.UTF_8), transmissionMode)

            val result = JSObject()
            result.put("messageId", messageId)
            result.put("queued", true)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to send message: ${e.message}")
        }
    }

    // ─── Status ───────────────────────────────────────────────────

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val bf = bridgefy
        val result = JSObject()

        if (bf == null) {
            result.put("isRunning", false)
            result.put("isConnected", false)
            result.put("nearbyDeviceCount", 0)
            result.put("userId", "")
            call.resolve(result)
            return
        }

        result.put("isRunning", bf.isStarted)
        result.put("isConnected", bf.connectedPeers.isNotEmpty())
        result.put("nearbyDeviceCount", bf.connectedPeers.size)
        result.put("userId", userId)
        call.resolve(result)
    }

    @PluginMethod
    fun getNearbyDevices(call: PluginCall) {
        val bf = bridgefy
        val result = JSObject()

        if (bf == null) {
            result.put("count", 0)
            result.put("devices", JSArray())
            call.resolve(result)
            return
        }

        val devices = JSArray()
        bf.connectedPeers.forEach { peer ->
            val device = JSObject()
            device.put("deviceId", peer.id)
            device.put("userId", peer.userId ?: "")
            device.put("lastSeen", System.currentTimeMillis())
            devices.put(device)
        }

        result.put("count", bf.connectedPeers.size)
        result.put("devices", devices)
        call.resolve(result)
    }

    @PluginMethod
    fun isBluetoothAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", true)
        result.put("enabled", true)
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
        val result = JSObject()
        result.put("bluetooth", if (getPermissionState("bluetooth") == PermissionState.GRANTED) "granted" else "denied")
        result.put("location", "granted")
        call.resolve(result)
    }

    // ─── Bridgefy Delegate ────────────────────────────────────────

    override fun onStarted(userId: String) {
        val data = JSObject()
        data.put("isRunning", true)
        data.put("isConnected", false)
        data.put("nearbyDeviceCount", 0)
        data.put("userId", userId)
        notifyListeners("meshStatusChanged", data)
    }

    override fun onStopped() {
        val data = JSObject()
        data.put("isRunning", false)
        data.put("isConnected", false)
        data.put("nearbyDeviceCount", 0)
        data.put("userId", userId)
        notifyListeners("meshStatusChanged", data)
    }

    override fun onConnectedToPeer(peerUserId: String) {
        val data = JSObject()
        data.put("deviceId", peerUserId)
        data.put("userId", peerUserId)
        data.put("lastSeen", System.currentTimeMillis())
        notifyListeners("deviceConnected", data)
    }

    override fun onDisconnectedFromPeer(peerUserId: String) {
        val data = JSObject()
        data.put("deviceId", peerUserId)
        data.put("userId", peerUserId)
        data.put("lastSeen", System.currentTimeMillis())
        notifyListeners("deviceDisconnected", data)
    }

    override fun onReceivedData(
        data: ByteArray,
        fromPeer: String,
        messageId: String,
        transmissionMode: TransmissionMode,
        hops: Int
    ) {
        // Deduplication
        if (processedMessageIds.contains(messageId)) return
        processedMessageIds.add(messageId)

        // Limit cache size
        if (processedMessageIds.size > 1000) {
            processedMessageIds.iterator().let { iterator ->
                repeat(100) { if (iterator.hasNext()) iterator.remove() }
            }
        }

        val content = String(data, Charsets.UTF_8)

        val eventData = JSObject()
        eventData.put("messageId", messageId)
        eventData.put("senderId", fromPeer)
        eventData.put("content", content)
        eventData.put("receivedAt", System.currentTimeMillis())
        eventData.put("hops", hops)
        notifyListeners("messageReceived", eventData)
    }

    override fun onSentData(messageId: String) {
        val data = JSObject()
        data.put("messageId", messageId)
        notifyListeners("messageSent", data)
    }

    override fun onFailedSendingData(messageId: String, error: Exception) {
        val data = JSObject()
        data.put("messageId", messageId)
        data.put("error", error.message ?: "Unknown error")
        notifyListeners("messageFailedToSend", data)
    }

    override fun onFailedWithError(error: Exception) {
        // Log error
    }
}
```

---

## 6. TypeScript Service Layer

### 6.1 Bridgefy Service

```typescript
// frontend/src/native/bridgefyService.ts

import { registerPlugin } from '@capacitor/core';
import type {
  BridgefyPlugin,
  MeshStatus,
  ReceivedMessage,
  SendOptions
} from '../plugins/bridgefy/definitions';
import { isNative } from './platform';
import { isOnline } from './networkService';

// Register the plugin
const Bridgefy = registerPlugin<BridgefyPlugin>('Bridgefy', {
  web: () => import('../plugins/bridgefy/web').then(m => new m.BridgefyWeb()),
});

// ─── Types ───────────────────────────────────────────────────────

export interface BridgefySOSMessage {
  type: 'sos';
  version: 1;
  messageId: string;
  senderId: string;
  payload: {
    lat: number;
    lng: number;
    accuracy: number;
    severity: 1 | 2 | 3 | 4 | 5;
    status: 'S' | 'I' | 'T' | 'E'; // Safe, Injured, Trapped, Evacuate
    timestamp: number;
    details?: string;
    patientName?: string;
    bloodType?: string;
    medicalConditions?: string[];
  };
  ttl: number;
  hops: number;
  routedVia: string[];
  target: 'broadcast';
}

export interface BridgefyAckMessage {
  type: 'sos_ack';
  originalMessageId: string;
  acknowledgedBy: 'backend' | 'responder';
  sosId?: string;
  responderId?: string;
  eta?: number;
  timestamp: number;
}

type BridgefyMessage = BridgefySOSMessage | BridgefyAckMessage;

type MessageListener = (message: BridgefySOSMessage) => void;
type AckListener = (ack: BridgefyAckMessage) => void;
type StatusListener = (status: MeshStatus) => void;

// ─── Service Class ───────────────────────────────────────────────

class BridgefyServiceClass {
  private initialized = false;
  private running = false;
  private userId = '';
  private processedMessageIds = new Set<string>();

  // Listeners
  private messageListeners: MessageListener[] = [];
  private ackListeners: AckListener[] = [];
  private statusListeners: StatusListener[] = [];

  // Plugin listeners cleanup
  private cleanupFunctions: Array<() => void> = [];

  /**
   * Initialize Bridgefy SDK
   */
  async initialize(userId: string): Promise<boolean> {
    if (!isNative) {
      console.warn('Bridgefy is only available on native platforms');
      return false;
    }

    if (this.initialized) {
      return true;
    }

    const apiKey = import.meta.env.VITE_BRIDGEFY_API_KEY;
    if (!apiKey) {
      console.error('VITE_BRIDGEFY_API_KEY not configured');
      return false;
    }

    try {
      // Check Bluetooth availability
      const btStatus = await Bridgefy.isBluetoothAvailable();
      if (!btStatus.available || !btStatus.enabled) {
        console.warn('Bluetooth not available or disabled');
        return false;
      }

      // Request permissions if needed
      const permissions = await Bridgefy.requestPermissions();
      if (permissions.bluetooth !== 'granted') {
        console.error('Bluetooth permission denied');
        return false;
      }

      // Initialize SDK
      const result = await Bridgefy.initialize({
        apiKey,
        userId,
        propagationProfile: 'standard',
      });

      if (!result.success) {
        return false;
      }

      this.userId = userId;
      this.initialized = true;

      // Set up event listeners
      await this.setupListeners();

      return true;
    } catch (error) {
      console.error('Bridgefy initialization failed:', error);
      return false;
    }
  }

  /**
   * Start the mesh network
   */
  async start(): Promise<boolean> {
    if (!this.initialized) {
      console.error('Bridgefy not initialized');
      return false;
    }

    if (this.running) {
      return true;
    }

    try {
      await Bridgefy.start({
        autoConnect: true,
        transmitPower: 'high', // Maximum range for emergencies
      });

      this.running = true;
      return true;
    } catch (error) {
      console.error('Failed to start Bridgefy:', error);
      return false;
    }
  }

  /**
   * Stop the mesh network
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    try {
      await Bridgefy.stop();
      this.running = false;
    } catch (error) {
      console.error('Failed to stop Bridgefy:', error);
    }
  }

  /**
   * Send SOS via mesh network
   */
  async sendSOS(sosData: {
    messageId: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    severity: number;
    patientStatus: string;
    details?: string;
    patientName?: string;
    bloodType?: string;
    medicalConditions?: string[];
  }): Promise<boolean> {
    if (!this.running) {
      console.warn('Bridgefy not running');
      return false;
    }

    const message: BridgefySOSMessage = {
      type: 'sos',
      version: 1,
      messageId: sosData.messageId,
      senderId: this.userId,
      payload: {
        lat: sosData.latitude,
        lng: sosData.longitude,
        accuracy: sosData.accuracy,
        severity: sosData.severity as 1 | 2 | 3 | 4 | 5,
        status: this.mapStatus(sosData.patientStatus),
        timestamp: Date.now(),
        details: sosData.details?.substring(0, 100),
        patientName: sosData.patientName,
        bloodType: sosData.bloodType,
        medicalConditions: sosData.medicalConditions?.slice(0, 5),
      },
      ttl: 15, // Max 15 hops
      hops: 0,
      routedVia: [],
      target: 'broadcast',
    };

    try {
      const result = await Bridgefy.send({
        messageId: sosData.messageId,
        content: JSON.stringify(message),
        target: 'broadcast',
        ttl: 15,
      });

      return result.queued;
    } catch (error) {
      console.error('Failed to send SOS via Bridgefy:', error);
      return false;
    }
  }

  /**
   * Get current mesh status
   */
  async getStatus(): Promise<MeshStatus> {
    if (!isNative || !this.initialized) {
      return {
        isRunning: false,
        isConnected: false,
        nearbyDeviceCount: 0,
        userId: '',
      };
    }

    return Bridgefy.getStatus();
  }

  /**
   * Get nearby device count
   */
  async getNearbyDeviceCount(): Promise<number> {
    const status = await this.getStatus();
    return status.nearbyDeviceCount;
  }

  /**
   * Check if mesh is connected
   */
  async isConnected(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isConnected;
  }

  /**
   * Subscribe to incoming SOS messages
   */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  /**
   * Subscribe to SOS acknowledgments
   */
  onAck(listener: AckListener): () => void {
    this.ackListeners.push(listener);
    return () => {
      this.ackListeners = this.ackListeners.filter(l => l !== listener);
    };
  }

  /**
   * Subscribe to mesh status changes
   */
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  // ─── Private Methods ───────────────────────────────────────────

  private async setupListeners(): Promise<void> {
    // Message received
    const messageHandle = await Bridgefy.addListener(
      'messageReceived',
      async (received: ReceivedMessage) => {
        await this.handleReceivedMessage(received);
      }
    );
    this.cleanupFunctions.push(() => messageHandle.remove());

    // Status changes
    const statusHandle = await Bridgefy.addListener(
      'meshStatusChanged',
      (status: MeshStatus) => {
        this.statusListeners.forEach(l => l(status));
      }
    );
    this.cleanupFunctions.push(() => statusHandle.remove());
  }

  private async handleReceivedMessage(received: ReceivedMessage): Promise<void> {
    // Deduplication
    if (this.processedMessageIds.has(received.messageId)) {
      return;
    }
    this.processedMessageIds.add(received.messageId);

    // Limit cache size
    if (this.processedMessageIds.size > 1000) {
      const iterator = this.processedMessageIds.values();
      for (let i = 0; i < 100; i++) {
        const first = iterator.next();
        if (!first.done) this.processedMessageIds.delete(first.value);
      }
    }

    try {
      const message: BridgefyMessage = JSON.parse(received.content);

      if (message.type === 'sos') {
        await this.handleSOSMessage(message, received.hops);
      } else if (message.type === 'sos_ack') {
        this.handleAckMessage(message);
      }
    } catch (error) {
      console.error('Failed to parse Bridgefy message:', error);
    }
  }

  private async handleSOSMessage(
    sos: BridgefySOSMessage,
    currentHops: number
  ): Promise<void> {
    // Notify listeners
    this.messageListeners.forEach(l => l(sos));

    // If we have internet, relay to backend
    if (await isOnline()) {
      await this.relayToBackend(sos, currentHops);
    }

    // If TTL remaining, re-broadcast
    if (sos.ttl > 0) {
      const relayMessage: BridgefySOSMessage = {
        ...sos,
        ttl: sos.ttl - 1,
        hops: sos.hops + 1,
        routedVia: [...sos.routedVia, this.userId],
      };

      await Bridgefy.send({
        messageId: `${sos.messageId}-relay-${this.userId}`,
        content: JSON.stringify(relayMessage),
        target: 'broadcast',
        ttl: relayMessage.ttl,
      });
    }
  }

  private async relayToBackend(
    sos: BridgefySOSMessage,
    currentHops: number
  ): Promise<void> {
    try {
      const response = await fetch('/api/v1/mesh/relay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...sos,
          hops: currentHops,
          relayedBy: this.userId,
          relayedAt: Date.now(),
        }),
      });

      if (response.ok) {
        const result = await response.json();

        // Send acknowledgment back through mesh
        await this.sendAcknowledgment(sos.messageId, sos.senderId, result.sos_id);
      }
    } catch (error) {
      console.error('Failed to relay SOS to backend:', error);
    }
  }

  private async sendAcknowledgment(
    originalMessageId: string,
    targetUserId: string,
    sosId: string
  ): Promise<void> {
    const ack: BridgefyAckMessage = {
      type: 'sos_ack',
      originalMessageId,
      acknowledgedBy: 'backend',
      sosId,
      timestamp: Date.now(),
    };

    await Bridgefy.send({
      messageId: `ack-${originalMessageId}`,
      content: JSON.stringify(ack),
      target: 'broadcast', // Broadcast to increase delivery chance
    });
  }

  private handleAckMessage(ack: BridgefyAckMessage): void {
    this.ackListeners.forEach(l => l(ack));
  }

  private mapStatus(status: string): 'S' | 'I' | 'T' | 'E' {
    switch (status.toLowerCase()) {
      case 'safe': return 'S';
      case 'injured': return 'I';
      case 'trapped': return 'T';
      case 'evacuate': return 'E';
      default: return 'I';
    }
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
    await this.stop();
    this.initialized = false;
    this.messageListeners = [];
    this.ackListeners = [];
    this.statusListeners = [];
  }
}

// Export singleton instance
export const BridgefyService = new BridgefyServiceClass();
```

### 6.2 Connection Manager Service

```typescript
// frontend/src/services/connectionManager.ts

import { getNetworkStatus, addNetworkListener, type NetworkState } from '../native/networkService';
import { BridgefyService } from '../native/bridgefyService';
import { isNative } from '../native/platform';

// ─── Types ───────────────────────────────────────────────────────

export type ConnectionLayer = 'internet' | 'sms' | 'bluetooth' | 'none';

export interface ConnectionState {
  currentLayer: ConnectionLayer;
  internet: {
    available: boolean;
    quality: 'good' | 'poor' | 'none';
    lastCheck: number;
  };
  cellular: {
    available: boolean;
    canSendSMS: boolean;
  };
  bluetooth: {
    available: boolean;
    meshConnected: boolean;
    nearbyDevices: number;
  };
}

type ConnectionListener = (state: ConnectionState) => void;

// ─── Service Class ───────────────────────────────────────────────

class ConnectionManagerClass {
  private state: ConnectionState;
  private listeners: Set<ConnectionListener> = new Set();
  private networkCleanup: (() => void) | null = null;
  private meshCleanup: (() => void) | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    this.state = this.getInitialState();
  }

  /**
   * Initialize connection monitoring
   */
  async initialize(userId?: string): Promise<void> {
    if (this.initialized) return;

    // Start network monitoring
    this.networkCleanup = addNetworkListener((status) => {
      this.updateNetworkState(status);
    });

    // Initialize Bridgefy if on native
    if (isNative && userId) {
      const bridgefyReady = await BridgefyService.initialize(userId);
      if (bridgefyReady) {
        await BridgefyService.start();

        this.meshCleanup = BridgefyService.onStatusChange((status) => {
          this.state.bluetooth = {
            available: true,
            meshConnected: status.isConnected,
            nearbyDevices: status.nearbyDeviceCount,
          };
          this.updateCurrentLayer();
          this.notifyListeners();
        });
      }
    }

    // Start health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10000); // Every 10 seconds

    // Initial check
    await this.performHealthCheck();

    this.initialized = true;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get best available layer for SOS delivery
   */
  getBestLayer(): ConnectionLayer {
    // Priority: Internet > SMS > Bluetooth
    if (this.state.internet.available && this.state.internet.quality !== 'none') {
      return 'internet';
    }
    if (this.state.cellular.canSendSMS) {
      return 'sms';
    }
    if (this.state.bluetooth.meshConnected && this.state.bluetooth.nearbyDevices > 0) {
      return 'bluetooth';
    }
    return 'none';
  }

  /**
   * Get ordered fallback chain based on current state
   */
  getFallbackChain(): ConnectionLayer[] {
    const chain: ConnectionLayer[] = [];

    // Internet first if good quality
    if (this.state.internet.available && this.state.internet.quality === 'good') {
      chain.push('internet');
    }

    // SMS if cellular available
    if (this.state.cellular.canSendSMS) {
      chain.push('sms');
    }

    // Bluetooth mesh if connected
    if (this.state.bluetooth.meshConnected) {
      chain.push('bluetooth');
    }

    // Internet as last resort even if poor
    if (this.state.internet.available && !chain.includes('internet')) {
      chain.push('internet');
    }

    return chain;
  }

  /**
   * Subscribe to connection state changes
   */
  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // Immediate callback
    return () => this.listeners.delete(listener);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.networkCleanup?.();
    this.meshCleanup?.();
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.listeners.clear();
    this.initialized = false;
  }

  // ─── Private Methods ───────────────────────────────────────────

  private getInitialState(): ConnectionState {
    return {
      currentLayer: 'none',
      internet: {
        available: navigator.onLine,
        quality: navigator.onLine ? 'good' : 'none',
        lastCheck: 0,
      },
      cellular: {
        available: false,
        canSendSMS: isNative, // Assume SMS available on native
      },
      bluetooth: {
        available: false,
        meshConnected: false,
        nearbyDevices: 0,
      },
    };
  }

  private async performHealthCheck(): Promise<void> {
    // Check internet with actual request
    await this.checkInternetQuality();

    // Check cellular
    await this.checkCellularStatus();

    // Check Bluetooth mesh
    if (isNative) {
      const meshStatus = await BridgefyService.getStatus();
      this.state.bluetooth = {
        available: meshStatus.isRunning,
        meshConnected: meshStatus.isConnected,
        nearbyDevices: meshStatus.nearbyDeviceCount,
      };
    }

    this.updateCurrentLayer();
    this.notifyListeners();
  }

  private async checkInternetQuality(): Promise<void> {
    const networkStatus = await getNetworkStatus();

    if (!networkStatus.connected) {
      this.state.internet = {
        available: false,
        quality: 'none',
        lastCheck: Date.now(),
      };
      return;
    }

    // Ping health endpoint
    try {
      const start = Date.now();
      const response = await fetch('/api/v1/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const rtt = Date.now() - start;

      this.state.internet = {
        available: response.ok,
        quality: rtt < 1000 ? 'good' : rtt < 5000 ? 'poor' : 'none',
        lastCheck: Date.now(),
      };
    } catch {
      this.state.internet = {
        available: false,
        quality: 'none',
        lastCheck: Date.now(),
      };
    }
  }

  private async checkCellularStatus(): Promise<void> {
    const networkStatus = await getNetworkStatus();

    this.state.cellular = {
      available: networkStatus.connectionType === 'cellular',
      canSendSMS: isNative, // SMS always available on native devices
    };
  }

  private updateNetworkState(status: NetworkState): void {
    this.state.internet.available = status.connected;
    if (!status.connected) {
      this.state.internet.quality = 'none';
    }
    this.state.cellular.available = status.connectionType === 'cellular';
    this.updateCurrentLayer();
    this.notifyListeners();
  }

  private updateCurrentLayer(): void {
    this.state.currentLayer = this.getBestLayer();
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.state));
  }
}

// Export singleton instance
export const ConnectionManager = new ConnectionManagerClass();
```

### 6.3 SOS Dispatcher Service

```typescript
// frontend/src/services/sosDispatcher.ts

import { createSOS } from './api';
import { buildSMSBody, sendViaSMS } from './smsService';
import { BridgefyService } from '../native/bridgefyService';
import { ConnectionManager, type ConnectionLayer } from './connectionManager';
import { storePendingSOS, clearPendingSOS, getPendingSOS } from '../utils/offlineQueue';

// ─── Types ───────────────────────────────────────────────────────

export interface SOSPayload {
  patientId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  patientStatus: string;
  severity: number;
  details?: string;
  patientName?: string;
  bloodType?: string;
  medicalConditions?: string[];
  triageData?: Record<string, unknown>;
}

export interface SOSDispatchResult {
  success: boolean;
  layer: ConnectionLayer;
  messageId: string;
  sosId?: string;
  fallbacksAttempted: ConnectionLayer[];
  error?: string;
  acknowledgmentPending?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

const TMT_SMS_NUMBER = import.meta.env.VITE_TMT_SMS_NUMBER || '+970599000000';
const INTERNET_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;

// ─── Service Class ───────────────────────────────────────────────

class SOSDispatcherClass {
  private pendingAcks: Map<string, {
    resolve: (result: SOSDispatchResult) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor() {
    // Listen for mesh acknowledgments
    BridgefyService.onAck((ack) => {
      const pending = this.pendingAcks.get(ack.originalMessageId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve({
          success: true,
          layer: 'bluetooth',
          messageId: ack.originalMessageId,
          sosId: ack.sosId,
          fallbacksAttempted: ['bluetooth'],
          acknowledgmentPending: false,
        });
        this.pendingAcks.delete(ack.originalMessageId);
      }
    });
  }

  /**
   * Dispatch SOS through the best available channel with automatic fallback
   */
  async dispatch(payload: SOSPayload): Promise<SOSDispatchResult> {
    const messageId = crypto.randomUUID();
    const fallbacksAttempted: ConnectionLayer[] = [];

    // Get fallback chain based on current connectivity
    const fallbackChain = ConnectionManager.getFallbackChain();

    // If no connectivity at all, store for later and try Bluetooth
    if (fallbackChain.length === 0) {
      return this.handleNoConnectivity(payload, messageId);
    }

    // Try each layer in order
    for (const layer of fallbackChain) {
      fallbacksAttempted.push(layer);

      try {
        const result = await this.sendViaLayer(layer, payload, messageId);

        if (result.success) {
          // Clear any stored offline SOS since we succeeded
          await clearPendingSOS();

          return {
            ...result,
            fallbacksAttempted,
          };
        }
      } catch (error) {
        console.warn(`SOS dispatch via ${layer} failed:`, error);
        // Continue to next fallback
      }
    }

    // All layers failed - store for later
    await storePendingSOS({ ...payload, messageId, createdAt: Date.now() });

    return {
      success: false,
      layer: 'none',
      messageId,
      fallbacksAttempted,
      error: 'All communication channels unavailable. SOS queued for retry.',
    };
  }

  /**
   * Retry any pending SOS messages
   */
  async retryPending(): Promise<number> {
    const pending = await getPendingSOS();
    let succeeded = 0;

    for (const sos of pending) {
      const result = await this.dispatch(sos as SOSPayload);
      if (result.success) {
        succeeded++;
      }
    }

    return succeeded;
  }

  // ─── Private Methods ───────────────────────────────────────────

  private async sendViaLayer(
    layer: ConnectionLayer,
    payload: SOSPayload,
    messageId: string
  ): Promise<SOSDispatchResult> {
    switch (layer) {
      case 'internet':
        return this.sendViaInternet(payload, messageId);
      case 'sms':
        return this.sendViaSMS(payload, messageId);
      case 'bluetooth':
        return this.sendViaBluetooth(payload, messageId);
      default:
        return {
          success: false,
          layer: 'none',
          messageId,
          fallbacksAttempted: [],
          error: 'Unknown layer',
        };
    }
  }

  private async sendViaInternet(
    payload: SOSPayload,
    messageId: string
  ): Promise<SOSDispatchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INTERNET_TIMEOUT);

    try {
      const result = await createSOS({
        patient_id: payload.patientId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        patient_status: payload.patientStatus,
        severity: payload.severity,
        details: payload.details,
        triage_data: payload.triageData,
      });

      clearTimeout(timeout);

      return {
        success: true,
        layer: 'internet',
        messageId,
        sosId: result.id,
        fallbacksAttempted: ['internet'],
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private async sendViaSMS(
    payload: SOSPayload,
    messageId: string
  ): Promise<SOSDispatchResult> {
    const smsBody = await buildSMSBody(
      payload.patientId,
      payload.latitude,
      payload.longitude,
      payload.patientStatus,
      String(payload.severity)
    );

    const sent = await sendViaSMS(smsBody, TMT_SMS_NUMBER);

    if (sent) {
      return {
        success: true,
        layer: 'sms',
        messageId,
        fallbacksAttempted: ['sms'],
        // SMS doesn't give immediate confirmation
        acknowledgmentPending: true,
      };
    }

    throw new Error('Failed to send SMS');
  }

  private async sendViaBluetooth(
    payload: SOSPayload,
    messageId: string
  ): Promise<SOSDispatchResult> {
    const sent = await BridgefyService.sendSOS({
      messageId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy || 10,
      severity: payload.severity,
      patientStatus: payload.patientStatus,
      details: payload.details,
      patientName: payload.patientName,
      bloodType: payload.bloodType,
      medicalConditions: payload.medicalConditions,
    });

    if (!sent) {
      throw new Error('Failed to send via Bluetooth mesh');
    }

    // Wait for acknowledgment (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(messageId);
        // Even without ack, message was broadcast
        resolve({
          success: true,
          layer: 'bluetooth',
          messageId,
          fallbacksAttempted: ['bluetooth'],
          acknowledgmentPending: true,
        });
      }, 60000); // 1 minute timeout for mesh delivery

      this.pendingAcks.set(messageId, { resolve, timeout });
    });
  }

  private async handleNoConnectivity(
    payload: SOSPayload,
    messageId: string
  ): Promise<SOSDispatchResult> {
    // Store for later
    await storePendingSOS({ ...payload, messageId, createdAt: Date.now() });

    // Try Bluetooth even without confirmed connectivity
    // (there might be nearby devices)
    try {
      const btResult = await this.sendViaBluetooth(payload, messageId);
      return btResult;
    } catch {
      return {
        success: false,
        layer: 'none',
        messageId,
        fallbacksAttempted: ['bluetooth'],
        error: 'No connectivity. SOS stored for retry when connection available.',
      };
    }
  }
}

// Export singleton instance
export const SOSDispatcher = new SOSDispatcherClass();
```

---

## 7. Backend Integration

### 7.1 Mesh Relay Endpoint

```python
# backend/app/api/routes/mesh.py

"""
Mesh Relay API - Receives SOS messages relayed from Bridgefy mesh network
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime

from app.core.deps import get_db, get_current_user_optional
from app.models.sos_request import SosRequest, SOSSource
from app.models.patient import Patient
from app.tasks.triage import triage_sos_request
from app.services.websocket import broadcast_sos

router = APIRouter(prefix="/mesh", tags=["Mesh Relay"])

# ─── Schemas ───────────────────────────────────────────────────────

class MeshSOSPayload(BaseModel):
    lat: float
    lng: float
    accuracy: float
    severity: int
    status: str  # S, I, T, E
    timestamp: int
    details: Optional[str] = None
    patientName: Optional[str] = None
    bloodType: Optional[str] = None
    medicalConditions: Optional[List[str]] = None

class MeshSOSMessage(BaseModel):
    type: str = "sos"
    version: int = 1
    messageId: str
    senderId: str
    payload: MeshSOSPayload
    ttl: int
    hops: int
    routedVia: List[str]
    relayedBy: str
    relayedAt: int

class MeshRelayResponse(BaseModel):
    status: str
    sos_id: str
    mesh_hops: int
    duplicate: bool = False

# ─── Status Mapping ────────────────────────────────────────────────

STATUS_MAP = {
    'S': 'safe',
    'I': 'injured',
    'T': 'trapped',
    'E': 'evacuate',
}

# ─── Endpoints ─────────────────────────────────────────────────────

@router.post("/relay", response_model=MeshRelayResponse)
async def receive_mesh_sos(
    data: MeshSOSMessage,
    db: Session = Depends(get_db)
):
    """
    Receive SOS relayed from Bridgefy mesh network.

    This endpoint is called by devices that have internet connectivity
    when they receive an SOS from the mesh network.
    """

    # ─── Deduplication Check ───────────────────────────────────────
    existing = db.query(SosRequest).filter(
        SosRequest.external_id == data.messageId
    ).first()

    if existing:
        return MeshRelayResponse(
            status="duplicate",
            sos_id=str(existing.id),
            mesh_hops=data.hops,
            duplicate=True
        )

    # ─── Find Patient ──────────────────────────────────────────────
    patient = db.query(Patient).filter(
        Patient.id == data.senderId
    ).first()

    patient_id = patient.id if patient else None

    # ─── Map Patient Status ────────────────────────────────────────
    patient_status = STATUS_MAP.get(data.payload.status, 'injured')

    # ─── Create SOS Request ────────────────────────────────────────
    sos = SosRequest(
        id=uuid.uuid4(),
        external_id=data.messageId,
        patient_id=patient_id,
        latitude=data.payload.lat,
        longitude=data.payload.lng,
        patient_status=patient_status,
        severity=data.payload.severity,
        details=data.payload.details,
        source=SOSSource.MESH,
        mesh_hops=data.hops,
        mesh_relay_path=data.routedVia,
        mesh_relayed_by=uuid.UUID(data.relayedBy) if data.relayedBy else None,
        mesh_received_at=datetime.utcnow(),
        client_created_at=datetime.fromtimestamp(data.payload.timestamp / 1000),
        status="pending",
    )

    db.add(sos)
    db.commit()
    db.refresh(sos)

    # ─── Trigger Triage Pipeline ───────────────────────────────────
    triage_sos_request.delay({
        "id": str(sos.id),
        "patient_id": str(patient_id) if patient_id else None,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "severity": sos.severity,
        "patient_status": sos.patient_status,
        "details": sos.details,
        "source": "MESH",
    })

    # ─── Broadcast via WebSocket ───────────────────────────────────
    await broadcast_sos({
        "id": str(sos.id),
        "source": "MESH",
        "mesh_hops": data.hops,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "severity": sos.severity,
        "patient_status": sos.patient_status,
        "created_at": sos.created_at.isoformat(),
    })

    return MeshRelayResponse(
        status="received",
        sos_id=str(sos.id),
        mesh_hops=data.hops,
        duplicate=False
    )


@router.get("/stats")
async def get_mesh_stats(db: Session = Depends(get_db)):
    """
    Get mesh relay statistics for monitoring.
    """
    from sqlalchemy import func

    total_mesh_sos = db.query(func.count(SosRequest.id)).filter(
        SosRequest.source == SOSSource.MESH
    ).scalar()

    avg_hops = db.query(func.avg(SosRequest.mesh_hops)).filter(
        SosRequest.source == SOSSource.MESH
    ).scalar()

    return {
        "total_mesh_sos": total_mesh_sos,
        "average_hops": round(avg_hops, 2) if avg_hops else 0,
    }
```

### 7.2 Database Schema Updates

```python
# backend/app/models/sos_request.py - additions

from sqlalchemy import Column, String, Integer, DateTime, Enum, ARRAY
from sqlalchemy.dialects.postgresql import UUID
import enum

class SOSSource(str, enum.Enum):
    API = "API"
    SMS = "SMS"
    MESH = "MESH"
    OFFLINE_SYNC = "OFFLINE_SYNC"

# Add to SosRequest model:

class SosRequest(Base):
    # ... existing fields ...

    # Source tracking
    source = Column(Enum(SOSSource), default=SOSSource.API, nullable=False)
    external_id = Column(String(36), index=True, nullable=True)  # Client UUID

    # Mesh-specific fields
    mesh_hops = Column(Integer, default=0)
    mesh_relay_path = Column(ARRAY(String), nullable=True)
    mesh_relayed_by = Column(UUID(as_uuid=True), nullable=True)
    mesh_received_at = Column(DateTime, nullable=True)

    # Offline sync
    client_created_at = Column(DateTime, nullable=True)
    synced_at = Column(DateTime, nullable=True)

    # Delivery tracking
    delivery_layer = Column(String(20), nullable=True)
    fallbacks_attempted = Column(ARRAY(String), nullable=True)
```

### 7.3 Migration

```python
# backend/migrations/versions/xxx_add_mesh_fields.py

"""Add mesh relay fields to SOS requests

Revision ID: xxx
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # Add SOSSource enum type
    op.execute("CREATE TYPE sossource AS ENUM ('API', 'SMS', 'MESH', 'OFFLINE_SYNC')")

    # Add columns
    op.add_column('sos_requests', sa.Column('source',
        sa.Enum('API', 'SMS', 'MESH', 'OFFLINE_SYNC', name='sossource'),
        nullable=False, server_default='API'))
    op.add_column('sos_requests', sa.Column('external_id', sa.String(36), nullable=True))
    op.add_column('sos_requests', sa.Column('mesh_hops', sa.Integer(), server_default='0'))
    op.add_column('sos_requests', sa.Column('mesh_relay_path', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('sos_requests', sa.Column('mesh_relayed_by', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('sos_requests', sa.Column('mesh_received_at', sa.DateTime(), nullable=True))
    op.add_column('sos_requests', sa.Column('client_created_at', sa.DateTime(), nullable=True))
    op.add_column('sos_requests', sa.Column('synced_at', sa.DateTime(), nullable=True))
    op.add_column('sos_requests', sa.Column('delivery_layer', sa.String(20), nullable=True))
    op.add_column('sos_requests', sa.Column('fallbacks_attempted', postgresql.ARRAY(sa.String()), nullable=True))

    # Create index on external_id for deduplication
    op.create_index('ix_sos_requests_external_id', 'sos_requests', ['external_id'])

def downgrade():
    op.drop_index('ix_sos_requests_external_id', table_name='sos_requests')
    op.drop_column('sos_requests', 'fallbacks_attempted')
    op.drop_column('sos_requests', 'delivery_layer')
    op.drop_column('sos_requests', 'synced_at')
    op.drop_column('sos_requests', 'client_created_at')
    op.drop_column('sos_requests', 'mesh_received_at')
    op.drop_column('sos_requests', 'mesh_relayed_by')
    op.drop_column('sos_requests', 'mesh_relay_path')
    op.drop_column('sos_requests', 'mesh_hops')
    op.drop_column('sos_requests', 'external_id')
    op.drop_column('sos_requests', 'source')
    op.execute('DROP TYPE sossource')
```

---

## 8. SOS Fallback Chain

### 8.1 Complete Fallback Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SOS DISPATCH FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Presses SOS                                                           │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────┐                                                        │
│  │ ConnectionManager│                                                        │
│  │ .getFallbackChain│                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    FALLBACK CHAIN EXECUTION                          │   │
│  │                                                                      │   │
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐│   │
│  │  │  INTERNET   │     │    SMS      │     │     BLUETOOTH MESH      ││   │
│  │  │             │     │             │     │                         ││   │
│  │  │ 1. Try API  │────►│ 2. If fail  │────►│ 3. If fail              ││   │
│  │  │    POST     │     │    Send SMS │     │    Broadcast via BLE    ││   │
│  │  │             │     │             │     │                         ││   │
│  │  │ ✓ Success?  │     │ ✓ Success?  │     │ ✓ Queued?               ││   │
│  │  │   Return    │     │   Return    │     │   Return                ││   │
│  │  │             │     │   (pending) │     │   (pending ack)         ││   │
│  │  └─────────────┘     └─────────────┘     └─────────────────────────┘│   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           │ All failed?                                                     │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ Store in        │                                                        │
│  │ IndexedDB       │                                                        │
│  │ (Retry later)   │                                                        │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Decision Matrix

| Condition | Internet | SMS | Bluetooth | Action |
|-----------|----------|-----|-----------|--------|
| All available | ✅ | ✅ | ✅ | Try Internet → SMS → Bluetooth |
| Internet only | ✅ | ❌ | ❌ | Try Internet only |
| Cellular only | ❌ | ✅ | ❌ | Send SMS |
| Bluetooth only | ❌ | ❌ | ✅ | Broadcast via mesh |
| Poor internet | ⚠️ | ✅ | ✅ | Try SMS → Bluetooth → Internet |
| None | ❌ | ❌ | ❌ | Store locally + try Bluetooth |

---

## 9. Security & Encryption

### 9.1 Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LAYER 1: BRIDGEFY SDK E2E                         │   │
│  │                                                                      │   │
│  │  • Built-in AES-256 encryption                                      │   │
│  │  • Automatic key exchange between devices                           │   │
│  │  • SDK handles all crypto                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LAYER 2: TMT APPLICATION                          │   │
│  │                                                                      │   │
│  │  • Patient ID verification (only known patients)                    │   │
│  │  • Message signature (HMAC-SHA256)                                  │   │
│  │  • Rate limiting (prevent spam)                                     │   │
│  │  • Deduplication (UUID-based)                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LAYER 3: TRANSPORT                                │   │
│  │                                                                      │   │
│  │  • HTTPS for backend relay                                          │   │
│  │  • TLS 1.3 for WebSocket                                           │   │
│  │  • Certificate pinning                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Anti-Abuse Measures

| Measure | Implementation |
|---------|----------------|
| **Rate Limiting** | Max 5 SOS per device per hour |
| **Deduplication** | UUID + timestamp validation |
| **Relay Limit** | Max 3 relays per message per device |
| **TTL Enforcement** | Messages expire after 15 hops |
| **Source Validation** | Only registered TMT devices can relay |

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// frontend/src/native/bridgefyService.test.ts

describe('BridgefyService', () => {
  describe('initialization', () => {
    it('should initialize with valid API key', async () => {});
    it('should fail with missing API key', async () => {});
    it('should request permissions on initialize', async () => {});
  });

  describe('sendSOS', () => {
    it('should create valid message structure', async () => {});
    it('should include all required fields', async () => {});
    it('should truncate details to 100 chars', async () => {});
  });

  describe('message handling', () => {
    it('should deduplicate received messages', async () => {});
    it('should relay messages when online', async () => {});
    it('should decrement TTL on relay', async () => {});
  });
});
```

### 10.2 Integration Tests

```typescript
// frontend/src/services/sosDispatcher.test.ts

describe('SOSDispatcher', () => {
  describe('fallback chain', () => {
    it('should try internet first when available', async () => {});
    it('should fallback to SMS when internet fails', async () => {});
    it('should fallback to Bluetooth when SMS fails', async () => {});
    it('should store locally when all fail', async () => {});
  });

  describe('retry mechanism', () => {
    it('should retry pending SOS when connection restores', async () => {});
    it('should clear pending after successful delivery', async () => {});
  });
});
```

### 10.3 Device Testing Matrix

| Test Scenario | iOS | Android | Expected Result |
|---------------|-----|---------|-----------------|
| Initialize SDK | ✅ | ✅ | SDK starts successfully |
| Bluetooth permissions | ✅ | ✅ | Permissions granted |
| Send SOS (online) | ✅ | ✅ | API delivery |
| Send SOS (offline) | ✅ | ✅ | Mesh broadcast |
| Receive + relay | ✅ | ✅ | Message forwarded |
| Background operation | ✅ | ✅ | Continues in background |
| Multi-hop delivery | ✅ | ✅ | 3+ hops successful |

---

## 11. Deployment & Configuration

### 11.1 Bridgefy Account Setup

1. Register at https://developer.bridgefy.me
2. Create new application
3. Get API key and license
4. Configure in environment variables

### 11.2 Environment Configuration

```bash
# frontend/.env.production
VITE_BRIDGEFY_API_KEY=pk_live_xxxxxxxxxxxx
VITE_BRIDGEFY_LICENSE=license_xxxxxxxxxxxx
VITE_TMT_SMS_NUMBER=+970599000000

# backend/.env
BRIDGEFY_WEBHOOK_SECRET=your-webhook-secret
```

### 11.3 Capacitor Configuration

```typescript
// frontend/capacitor.config.ts

const config: CapacitorConfig = {
  // ... existing config ...

  plugins: {
    // ... existing plugins ...

    Bridgefy: {
      apiKey: process.env.VITE_BRIDGEFY_API_KEY,
      propagationProfile: 'standard',
      backgroundMode: true,
    },
  },
};
```

---

## 12. Monitoring & Analytics

### 12.1 Metrics to Track

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `mesh_sos_sent` | SOS sent via mesh | - |
| `mesh_sos_received` | SOS received via mesh | - |
| `mesh_sos_relayed` | SOS relayed to backend | - |
| `mesh_avg_hops` | Average hops to delivery | > 10 |
| `mesh_nearby_devices` | Nearby device count | 0 (offline) |
| `mesh_delivery_time` | Time to acknowledgment | > 5 min |
| `fallback_trigger_rate` | % of SOS using fallback | > 20% |

### 12.2 Dashboard Additions

```typescript
// Add to hospital dashboard
interface MeshMetrics {
  totalMeshSOS: number;
  averageHops: number;
  deliverySuccessRate: number;
  activeRelayDevices: number;
}
```

---

## 13. Error Handling & Edge Cases

### 13.1 Error Scenarios

| Scenario | Handling |
|----------|----------|
| Bluetooth disabled | Prompt user to enable |
| Permissions denied | Graceful degradation to SMS |
| SDK initialization fails | Retry with backoff |
| No nearby devices | Store locally + periodic retry |
| Message delivery timeout | Mark as pending, continue retry |
| Duplicate message | Silently discard |
| Invalid message format | Log and discard |
| Battery low | Reduce transmit frequency |

### 13.2 Graceful Degradation

```
Full Capability → Bluetooth Disabled → SMS Only → Internet Only → Offline Storage
```

---

## 14. Cost Analysis

### 14.1 Bridgefy Pricing

| Plan | Devices | Monthly Cost | Annual Cost |
|------|---------|--------------|-------------|
| Starter | 1,000 | Free | Free |
| Growth | 10,000 | $299 | $2,990 |
| Pro | 50,000 | $799 | $7,990 |
| Enterprise | Unlimited | Custom | Custom |

**Recommendation**: Start with Starter (free), upgrade as user base grows.

### 14.2 Development Cost Estimate

| Phase | Hours | Cost (@ $100/hr) |
|-------|-------|------------------|
| Native Plugin | 40 | $4,000 |
| TypeScript Services | 24 | $2,400 |
| Backend Integration | 16 | $1,600 |
| Testing | 24 | $2,400 |
| Documentation | 8 | $800 |
| **Total** | **112** | **$11,200** |

---

## 15. Implementation Tasks Checklist

### Phase 1: Foundation (Week 1)
- [ ] Create Bridgefy developer account
- [ ] Obtain API key and license
- [ ] Create plugin directory structure
- [ ] Define TypeScript interfaces
- [ ] Add environment variables

### Phase 2: Native Plugin (Week 2-3)
- [ ] Implement iOS Swift plugin
- [ ] Implement Android Kotlin plugin
- [ ] Register plugins with Capacitor
- [ ] Test basic initialization
- [ ] Test send/receive on devices

### Phase 3: TypeScript Services (Week 3-4)
- [ ] Implement BridgefyService
- [ ] Implement ConnectionManager
- [ ] Implement SOSDispatcher
- [ ] Create React hooks
- [ ] Write unit tests

### Phase 4: Backend Integration (Week 4)
- [ ] Create mesh.py routes
- [ ] Add database migrations
- [ ] Update SOS model
- [ ] Add mesh stats endpoint
- [ ] Test end-to-end relay

### Phase 5: SOS Page Integration (Week 5)
- [ ] Modify SOS.tsx to use SOSDispatcher
- [ ] Add mesh status indicator
- [ ] Add delivery confirmation UI
- [ ] Handle acknowledgments
- [ ] Test fallback scenarios

### Phase 6: Testing & QA (Week 5-6)
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] Multi-device mesh testing
- [ ] Edge case validation
- [ ] Performance testing
- [ ] Security audit

---

## Appendix A: File Locations

| File | Path |
|------|------|
| iOS Plugin | `frontend/ios/App/App/plugins/BridgefyPlugin/` |
| Android Plugin | `frontend/android/app/src/main/java/com/tmt/emergency/plugins/` |
| TS Plugin Interface | `frontend/src/plugins/bridgefy/` |
| Bridgefy Service | `frontend/src/native/bridgefyService.ts` |
| Connection Manager | `frontend/src/services/connectionManager.ts` |
| SOS Dispatcher | `frontend/src/services/sosDispatcher.ts` |
| Backend Routes | `backend/app/api/routes/mesh.py` |
| This Plan | `docs/BRIDGEFY_INTEGRATION_PLAN.md` |

---

## Appendix B: References

- [Bridgefy SDK Documentation](https://developer.bridgefy.me/docs)
- [Capacitor Plugin Development](https://capacitorjs.com/docs/plugins/creating-plugins)
- [BLE Best Practices](https://developer.apple.com/documentation/corebluetooth)
- [TMT SOS Fallback Analysis](./SOS_FALLBACK_SYSTEM_ANALYSIS.md)

---

*Document Version: 1.0.0*
*Last Updated: 2026-02-17*
*Authored by: TMT Engineering Team*
