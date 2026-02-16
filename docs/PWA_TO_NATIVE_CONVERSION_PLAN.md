# TMT PWA to Native App Conversion Plan

> **Document Version:** 1.0.0
> **Created:** 2026-02-15
> **Status:** In Progress
> **Goal:** Convert TMT PWA to Native iOS/Android apps using Capacitor, enabling Bluetooth mesh (Bridgefy) for offline SOS

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Phase 1: Pre-Conversion Preparation](#4-phase-1-pre-conversion-preparation)
5. [Phase 2: Capacitor Core Setup](#5-phase-2-capacitor-core-setup)
6. [Phase 3: iOS Platform Configuration](#6-phase-3-ios-platform-configuration)
7. [Phase 4: Android Platform Configuration](#7-phase-4-android-platform-configuration)
8. [Phase 5: Native Plugin Integration](#8-phase-5-native-plugin-integration)
9. [Phase 6: Bridgefy Bluetooth Mesh Integration](#9-phase-6-bridgefy-bluetooth-mesh-integration)
10. [Phase 7: Testing & Quality Assurance](#10-phase-7-testing--quality-assurance)
11. [Phase 8: App Store Preparation](#11-phase-8-app-store-preparation)
12. [Phase 9: Deployment & Release](#12-phase-9-deployment--release)
13. [Risk Management](#13-risk-management)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

### 1.1 Project Objective
Convert the TMT (Triage & Monitor for Threats) Progressive Web App into native iOS and Android applications while:
- Preserving 100% of existing React codebase functionality
- Enabling Bluetooth mesh networking via Bridgefy SDK
- Implementing multi-layer SOS fallback: Internet → SMS → Bluetooth
- Maintaining offline-first architecture
- Achieving App Store/Play Store publication readiness

### 1.2 Technology Stack
| Layer | Current (PWA) | Target (Native) |
|-------|---------------|-----------------|
| Framework | React 19 + Vite | React 19 + Vite + **Capacitor 6** |
| iOS Runtime | Safari WebView | WKWebView + Native Swift |
| Android Runtime | Chrome WebView | Android WebView + Native Kotlin |
| Bluetooth | ❌ Not Available | Bridgefy SDK (Native) |
| Push Notifications | ❌ Limited | Firebase Cloud Messaging |
| Camera | HTML5 Input | Native Camera API |
| Geolocation | Web API | Native GPS |
| Background Tasks | Service Worker | Native Background Services |

### 1.3 Success Criteria
- [ ] All 84 existing frontend tests pass
- [ ] Native build compiles for iOS (Xcode)
- [ ] Native build compiles for Android (Android Studio)
- [ ] Bridgefy mesh networking operational
- [ ] App Store submission requirements met
- [ ] Play Store submission requirements met
- [ ] Zero regression in existing functionality

---

## 2. Current State Analysis

### 2.1 Existing PWA Features ✅
| Feature | Implementation | File Location |
|---------|---------------|---------------|
| Offline Detection | `useOffline` hook | `src/hooks/useOffline.ts` |
| Battery Status | `useBatteryStatus` hook | `src/hooks/useBatteryStatus.ts` |
| Voice Input | Web Speech API | `src/hooks/useVoiceInput.ts` |
| Camera Capture | HTML5 file input | `src/components/sos/CameraCapture.tsx` |
| Geolocation | Navigator API | `src/utils/locationCodec.ts` |
| SMS Fallback | URI scheme | `src/hooks/useSMSFallback.ts` |
| Service Worker | Cache-first + BG Sync | `public/sw.js` |
| WebSocket | Socket.io | `src/hooks/useWebSocket.ts` |
| State Management | Zustand | `src/store/*.ts` |
| Mapping | Leaflet + React-Leaflet | `src/components/maps/*` |
| i18n | i18next (AR/EN) | `src/locales/*` |

### 2.2 Missing Native Capabilities ❌
| Feature | Required For | Priority |
|---------|--------------|----------|
| Bluetooth Mesh | Bridgefy SOS fallback | 🔴 Critical |
| Push Notifications | Alert broadcasting | 🔴 Critical |
| Background GPS | Responder tracking | 🟡 High |
| Native Camera | Better quality/UX | 🟡 High |
| Biometric Auth | Secure login | 🟢 Medium |
| Haptic Feedback | SOS confirmation | 🟢 Medium |
| Native Storage | Encrypted data | 🟢 Medium |

### 2.3 Dependency Inventory
```
React: 19.0.0
React DOM: 19.0.0
React Router DOM: 7.1.5
Socket.io-client: 4.8.1
Zustand: 5.0.3
Leaflet: 1.9.4
React-Leaflet: 5.0.0
Recharts: 2.15.1
i18next: 24.2.2
React-i18next: 15.4.1
Vite: 6.1.0
TypeScript: ~5.7.2
Tailwind CSS: 4.0.7
```

---

## 3. Target Architecture

### 3.1 Layered Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                    TMT Native Application                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              React 19 + Vite (Web Layer)             │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐   │   │
│  │  │Dashboard│ │  SOS    │ │LiveMap  │ │Responder │   │   │
│  │  │  Views  │ │ Module  │ │ Module  │ │  Views   │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └──────────┘   │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │          Zustand State Management           │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Capacitor Bridge Layer (JS ↔ Native)       │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐    │   │
│  │  │Camera  │ │Push    │ │Storage │ │ Geolocation│    │   │
│  │  │Plugin  │ │Plugin  │ │Plugin  │ │  Plugin    │    │   │
│  │  └────────┘ └────────┘ └────────┘ └────────────┘    │   │
│  │  ┌────────────────────────────────────────────┐     │   │
│  │  │       Custom Bridgefy Plugin (Native)       │     │   │
│  │  └────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐    ┌────────────────────┐          │
│  │   iOS Native Shell │    │ Android Native Shell│          │
│  │   (Swift/ObjC)     │    │   (Kotlin/Java)     │          │
│  │                    │    │                     │          │
│  │  ┌──────────────┐  │    │  ┌──────────────┐   │          │
│  │  │ Bridgefy SDK │  │    │  │ Bridgefy SDK │   │          │
│  │  │ (Bluetooth)  │  │    │  │ (Bluetooth)  │   │          │
│  │  └──────────────┘  │    │  └──────────────┘   │          │
│  └────────────────────┘    └────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 SOS Fallback Flow (Native)
```
┌──────────────────────────────────────────────────────────────┐
│                    SOS Request Initiated                      │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              Check Internet Connectivity                      │
│              (Capacitor Network Plugin)                       │
└───────────────┬─────────────────────────────┬────────────────┘
                │ Online                      │ Offline
                ▼                             ▼
┌───────────────────────┐    ┌──────────────────────────────────┐
│  Send via WebSocket   │    │    Check SMS Capability          │
│  (Socket.io → Backend)│    │    (Capacitor SMS Plugin)        │
└───────────┬───────────┘    └──────────┬────────────┬─────────┘
            │                           │ Available  │ Unavailable
            ▼                           ▼            ▼
┌───────────────────────┐    ┌──────────────┐  ┌──────────────────┐
│       SUCCESS         │    │  Send SMS to │  │ Activate Bridgefy│
│   (AI Triage Active)  │    │  Gateway     │  │ Bluetooth Mesh   │
└───────────────────────┘    └──────────────┘  └──────────────────┘
                                    │                    │
                                    ▼                    ▼
                             ┌──────────────────────────────────┐
                             │      Nearby Device Receives      │
                             │      → Relays to Internet        │
                             │      → Reaches TMT Backend       │
                             └──────────────────────────────────┘
```

---

## 4. Phase 1: Pre-Conversion Preparation

### 4.1 Development Environment Setup

#### macOS Requirements
- [ ] **4.1.1** Verify macOS version (Ventura 13+ recommended)
  ```bash
  sw_vers
  # Expected: macOS 13.0+
  ```

- [ ] **4.1.2** Install/Update Xcode (15.0+)
  ```bash
  xcode-select --install
  xcodebuild -version
  # Expected: Xcode 15.0+
  ```

- [ ] **4.1.3** Install CocoaPods
  ```bash
  sudo gem install cocoapods
  pod --version
  # Expected: 1.14.0+
  ```

- [ ] **4.1.4** Install Android Studio (Hedgehog 2023.1.1+)
  - Download from: https://developer.android.com/studio
  - Install Android SDK 34 (API 34)
  - Install Android Build Tools 34.0.0
  - Configure ANDROID_HOME environment variable

- [ ] **4.1.5** Verify Java JDK 17
  ```bash
  java -version
  # Expected: openjdk 17+
  ```

- [ ] **4.1.6** Install/Update Node.js 20 LTS
  ```bash
  node -v && npm -v
  # Expected: v20.x.x, 10.x.x
  ```

#### Verification Test
```bash
# Run this script to verify all prerequisites
#!/bin/bash
echo "=== TMT Native Conversion Prerequisites Check ==="
echo ""
echo "1. macOS Version:"
sw_vers | grep ProductVersion
echo ""
echo "2. Xcode Version:"
xcodebuild -version 2>/dev/null || echo "❌ Xcode not installed"
echo ""
echo "3. CocoaPods Version:"
pod --version 2>/dev/null || echo "❌ CocoaPods not installed"
echo ""
echo "4. Android Studio:"
[ -d "/Applications/Android Studio.app" ] && echo "✅ Installed" || echo "❌ Not installed"
echo ""
echo "5. Java Version:"
java -version 2>&1 | head -1
echo ""
echo "6. Node.js Version:"
node -v
echo ""
echo "7. npm Version:"
npm -v
echo ""
echo "=== Check Complete ==="
```

### 4.2 Project Backup & Version Control

- [ ] **4.2.1** Create pre-conversion backup branch
  ```bash
  cd /Users/mac/Desktop/TMT/TMT
  git checkout -b backup/pre-native-conversion
  git push origin backup/pre-native-conversion
  ```

- [ ] **4.2.2** Create native conversion feature branch
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feature/native-app-conversion
  ```

- [ ] **4.2.3** Tag current stable version
  ```bash
  git tag -a v1.0.0-pwa -m "Last PWA-only version before native conversion"
  git push origin v1.0.0-pwa
  ```

### 4.3 Existing Tests Verification

- [ ] **4.3.1** Run all existing frontend tests
  ```bash
  cd /Users/mac/Desktop/TMT/TMT/frontend
  npm run test:run
  # Expected: 84 tests passing
  ```

- [ ] **4.3.2** Document current test count
  ```
  Current passing tests: ___/84
  Date verified: ____-__-__
  ```

- [ ] **4.3.3** Run build verification
  ```bash
  npm run build
  # Expected: Build successful with no errors
  ```

- [ ] **4.3.4** Run linting
  ```bash
  npm run lint
  # Expected: No errors
  ```

### 4.4 Environment Configuration

- [ ] **4.4.1** Create environment template file
  ```bash
  # frontend/.env.example
  ```
  Contents:
  ```env
  # API Configuration
  VITE_API_URL=http://localhost:8000
  VITE_WS_URL=ws://localhost:8000

  # SMS Gateway
  VITE_SMS_GATEWAY_NUMBER=+15551234567

  # Bridgefy (to be added)
  VITE_BRIDGEFY_API_KEY=your_bridgefy_api_key
  VITE_BRIDGEFY_LICENSE=your_bridgefy_license

  # Firebase (Push Notifications)
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_MESSAGING_SENDER_ID=
  VITE_FIREBASE_APP_ID=

  # App Info
  VITE_APP_VERSION=1.0.0
  VITE_APP_BUILD_NUMBER=1
  ```

- [ ] **4.4.2** Create local environment file
  ```bash
  cp frontend/.env.example frontend/.env.local
  ```

### 4.5 Documentation Review

- [ ] **4.5.1** Review existing architecture docs
  - [ ] `docs/SOS_FALLBACK_SYSTEM_ANALYSIS.md`
  - [ ] Project README files

- [ ] **4.5.2** Document current API endpoints in use
  - [ ] `/api/sos/*` - SOS operations
  - [ ] `/api/alerts/*` - Alert management
  - [ ] `/api/responder/*` - Responder operations
  - [ ] `/socket.io` - WebSocket connections

---

## 5. Phase 2: Capacitor Core Setup

### 5.1 Install Capacitor Dependencies

- [ ] **5.1.1** Install Capacitor Core
  ```bash
  cd /Users/mac/Desktop/TMT/TMT/frontend
  npm install @capacitor/core @capacitor/cli
  ```

- [ ] **5.1.2** Initialize Capacitor
  ```bash
  npx cap init "TMT" "com.tmt.emergency" --web-dir dist
  ```

- [ ] **5.1.3** Verify capacitor.config.ts created
  ```typescript
  // Expected content structure:
  import { CapacitorConfig } from '@capacitor/cli';

  const config: CapacitorConfig = {
    appId: 'com.tmt.emergency',
    appName: 'TMT',
    webDir: 'dist',
    server: {
      androidScheme: 'https'
    }
  };

  export default config;
  ```

### 5.2 Configure Capacitor for TMT

- [ ] **5.2.1** Update capacitor.config.ts with full configuration
  ```typescript
  import { CapacitorConfig } from '@capacitor/cli';

  const config: CapacitorConfig = {
    appId: 'com.tmt.emergency',
    appName: 'TMT - Emergency Response',
    webDir: 'dist',

    // Server configuration
    server: {
      androidScheme: 'https',
      iosScheme: 'https',
      hostname: 'tmt.local',
      // Enable for development
      // url: 'http://localhost:3000',
      // cleartext: true
    },

    // iOS specific
    ios: {
      contentInset: 'automatic',
      allowsLinkPreview: false,
      backgroundColor: '#1f2937',
      preferredContentMode: 'mobile'
    },

    // Android specific
    android: {
      backgroundColor: '#1f2937',
      allowMixedContent: false,
      captureInput: true,
      webContentsDebuggingEnabled: false // Set true for dev
    },

    // Plugins configuration
    plugins: {
      SplashScreen: {
        launchShowDuration: 2000,
        backgroundColor: '#1f2937',
        androidSplashResourceName: 'splash',
        showSpinner: false
      },
      Keyboard: {
        resize: 'body',
        resizeOnFullScreen: true
      },
      PushNotifications: {
        presentationOptions: ['badge', 'sound', 'alert']
      }
    }
  };

  export default config;
  ```

### 5.3 Update Build Configuration

- [ ] **5.3.1** Update package.json scripts
  ```json
  {
    "scripts": {
      "dev": "vite --port 3000 --host",
      "build": "tsc -b && vite build",
      "build:native": "npm run build && npx cap sync",
      "preview": "vite preview",
      "lint": "eslint .",
      "test": "vitest",
      "test:run": "vitest run",
      "test:coverage": "vitest run --coverage",
      "cap:sync": "npx cap sync",
      "cap:open:ios": "npx cap open ios",
      "cap:open:android": "npx cap open android",
      "cap:run:ios": "npx cap run ios",
      "cap:run:android": "npx cap run android"
    }
  }
  ```

- [ ] **5.3.2** Build project for Capacitor
  ```bash
  npm run build
  # Verify dist/ folder created with built assets
  ```

### 5.4 Install Essential Capacitor Plugins

- [ ] **5.4.1** Install core plugins
  ```bash
  npm install @capacitor/app @capacitor/haptics @capacitor/keyboard @capacitor/status-bar @capacitor/splash-screen
  ```

- [ ] **5.4.2** Install device plugins
  ```bash
  npm install @capacitor/device @capacitor/network @capacitor/geolocation
  ```

- [ ] **5.4.3** Install storage plugins
  ```bash
  npm install @capacitor/preferences @capacitor/filesystem
  ```

- [ ] **5.4.4** Install camera plugin
  ```bash
  npm install @capacitor/camera
  ```

- [ ] **5.4.5** Install push notifications
  ```bash
  npm install @capacitor/push-notifications
  ```

- [ ] **5.4.6** Install local notifications
  ```bash
  npm install @capacitor/local-notifications
  ```

- [ ] **5.4.7** Verify all plugins installed
  ```bash
  npm ls @capacitor/core
  # Should show all @capacitor/* packages
  ```

### 5.5 Create Capacitor Plugin Abstraction Layer

- [ ] **5.5.1** Create native plugins directory
  ```bash
  mkdir -p frontend/src/native
  ```

- [ ] **5.5.2** Create platform detection utility
  ```typescript
  // frontend/src/native/platform.ts
  import { Capacitor } from '@capacitor/core';

  export const isNative = Capacitor.isNativePlatform();
  export const isIOS = Capacitor.getPlatform() === 'ios';
  export const isAndroid = Capacitor.getPlatform() === 'android';
  export const isWeb = Capacitor.getPlatform() === 'web';

  export const getPlatformName = (): 'ios' | 'android' | 'web' => {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  };
  ```

- [ ] **5.5.3** Create device info service
  ```typescript
  // frontend/src/native/deviceService.ts
  import { Device } from '@capacitor/device';
  import { isNative } from './platform';

  export interface DeviceInfo {
    platform: string;
    model: string;
    osVersion: string;
    isVirtual: boolean;
    batteryLevel: number;
    isCharging: boolean;
  }

  export async function getDeviceInfo(): Promise<DeviceInfo> {
    if (!isNative) {
      return {
        platform: 'web',
        model: navigator.userAgent,
        osVersion: 'web',
        isVirtual: false,
        batteryLevel: 100,
        isCharging: true
      };
    }

    const info = await Device.getInfo();
    const battery = await Device.getBatteryInfo();

    return {
      platform: info.platform,
      model: info.model,
      osVersion: info.osVersion,
      isVirtual: info.isVirtual,
      batteryLevel: battery.batteryLevel ?? 100,
      isCharging: battery.isCharging ?? false
    };
  }
  ```

- [ ] **5.5.4** Create network service
  ```typescript
  // frontend/src/native/networkService.ts
  import { Network, ConnectionStatus } from '@capacitor/network';
  import { isNative } from './platform';

  export type NetworkType = 'wifi' | 'cellular' | 'none' | 'unknown';

  export interface NetworkState {
    connected: boolean;
    connectionType: NetworkType;
  }

  export async function getNetworkStatus(): Promise<NetworkState> {
    if (!isNative) {
      return {
        connected: navigator.onLine,
        connectionType: navigator.onLine ? 'wifi' : 'none'
      };
    }

    const status = await Network.getStatus();
    return {
      connected: status.connected,
      connectionType: status.connectionType as NetworkType
    };
  }

  export function addNetworkListener(
    callback: (status: NetworkState) => void
  ): () => void {
    if (!isNative) {
      const handler = () => callback({
        connected: navigator.onLine,
        connectionType: navigator.onLine ? 'wifi' : 'none'
      });
      window.addEventListener('online', handler);
      window.addEventListener('offline', handler);
      return () => {
        window.removeEventListener('online', handler);
        window.removeEventListener('offline', handler);
      };
    }

    const listener = Network.addListener('networkStatusChange', (status) => {
      callback({
        connected: status.connected,
        connectionType: status.connectionType as NetworkType
      });
    });

    return () => listener.remove();
  }
  ```

### 5.6 Verification Tests

- [ ] **5.6.1** Run tests after Capacitor setup
  ```bash
  npm run test:run
  # Expected: All 84 tests still passing
  ```

- [ ] **5.6.2** Run build with Capacitor
  ```bash
  npm run build
  # Expected: Build successful
  ```

- [ ] **5.6.3** Verify capacitor.config.ts is valid
  ```bash
  npx cap doctor
  # Expected: No errors
  ```

---

## 6. Phase 3: iOS Platform Configuration

### 6.1 Add iOS Platform

- [ ] **6.1.1** Add iOS platform to Capacitor
  ```bash
  cd /Users/mac/Desktop/TMT/TMT/frontend
  npm run build
  npx cap add ios
  ```

- [ ] **6.1.2** Verify ios/ folder structure created
  ```
  ios/
  ├── App/
  │   ├── App/
  │   │   ├── AppDelegate.swift
  │   │   ├── Info.plist
  │   │   ├── Assets.xcassets/
  │   │   └── ...
  │   ├── App.xcodeproj/
  │   └── Podfile
  └── ...
  ```

- [ ] **6.1.3** Sync web assets to iOS
  ```bash
  npx cap sync ios
  ```

### 6.2 Configure iOS App Settings

- [ ] **6.2.1** Update Info.plist with required permissions
  ```xml
  <!-- ios/App/App/Info.plist additions -->

  <!-- Camera -->
  <key>NSCameraUsageDescription</key>
  <string>TMT needs camera access to attach photos to SOS reports</string>

  <!-- Photo Library -->
  <key>NSPhotoLibraryUsageDescription</key>
  <string>TMT needs photo access to attach images to SOS reports</string>

  <!-- Location -->
  <key>NSLocationWhenInUseUsageDescription</key>
  <string>TMT needs your location to send accurate emergency coordinates</string>
  <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
  <string>TMT needs background location for responder tracking</string>

  <!-- Microphone (for voice input) -->
  <key>NSMicrophoneUsageDescription</key>
  <string>TMT needs microphone access for voice-activated SOS</string>

  <!-- Bluetooth (for Bridgefy) -->
  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>TMT uses Bluetooth for offline emergency mesh networking</string>
  <key>NSBluetoothPeripheralUsageDescription</key>
  <string>TMT uses Bluetooth to communicate during network outages</string>

  <!-- Background Modes -->
  <key>UIBackgroundModes</key>
  <array>
    <string>bluetooth-central</string>
    <string>bluetooth-peripheral</string>
    <string>location</string>
    <string>remote-notification</string>
    <string>fetch</string>
  </array>
  ```

- [ ] **6.2.2** Update iOS deployment target
  ```
  Minimum iOS Version: 15.0
  ```

- [ ] **6.2.3** Configure App Transport Security (if needed)
  ```xml
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    <key>NSExceptionDomains</key>
    <dict>
      <!-- Add development domains if needed -->
    </dict>
  </dict>
  ```

### 6.3 iOS Assets Configuration

- [ ] **6.3.1** Create app icons (all required sizes)
  ```
  Required iOS icon sizes:
  - 20x20 @1x, @2x, @3x
  - 29x29 @1x, @2x, @3x
  - 40x40 @1x, @2x, @3x
  - 60x60 @2x, @3x
  - 76x76 @1x, @2x (iPad)
  - 83.5x83.5 @2x (iPad Pro)
  - 1024x1024 (App Store)
  ```

- [ ] **6.3.2** Create splash screen assets
  ```
  Required splash screen sizes:
  - iPhone Portrait: Various sizes
  - iPhone Landscape: Various sizes
  - iPad Portrait/Landscape: Various sizes
  ```

- [ ] **6.3.3** Update Assets.xcassets with TMT branding
  - App icon: Red emergency theme
  - Splash screen: TMT logo on dark background (#1f2937)

### 6.4 iOS Build Configuration

- [ ] **6.4.1** Open Xcode project
  ```bash
  npx cap open ios
  ```

- [ ] **6.4.2** Configure signing
  - [ ] Set Development Team
  - [ ] Set Bundle Identifier: `com.tmt.emergency`
  - [ ] Enable Automatic Signing (or configure manual)

- [ ] **6.4.3** Configure capabilities in Xcode
  - [ ] Push Notifications
  - [ ] Background Modes (Location, Fetch, Remote notifications, Bluetooth)
  - [ ] Associated Domains (if using universal links)

- [ ] **6.4.4** Install CocoaPods dependencies
  ```bash
  cd ios/App
  pod install
  ```

### 6.5 iOS Verification

- [ ] **6.5.1** Build iOS project in Xcode
  ```
  Product → Build (⌘B)
  Expected: Build Succeeded
  ```

- [ ] **6.5.2** Run on iOS Simulator
  ```bash
  npx cap run ios --target "iPhone 15 Pro"
  ```

- [ ] **6.5.3** Test basic functionality
  - [ ] App launches
  - [ ] Navigation works
  - [ ] UI renders correctly
  - [ ] No console errors

---

## 7. Phase 4: Android Platform Configuration

### 7.1 Add Android Platform

- [ ] **7.1.1** Add Android platform to Capacitor
  ```bash
  cd /Users/mac/Desktop/TMT/TMT/frontend
  npx cap add android
  ```

- [ ] **7.1.2** Verify android/ folder structure
  ```
  android/
  ├── app/
  │   ├── src/
  │   │   └── main/
  │   │       ├── AndroidManifest.xml
  │   │       ├── java/
  │   │       └── res/
  │   ├── build.gradle
  │   └── ...
  ├── build.gradle
  ├── gradle.properties
  └── settings.gradle
  ```

- [ ] **7.1.3** Sync web assets to Android
  ```bash
  npx cap sync android
  ```

### 7.2 Configure Android App Settings

- [ ] **7.2.1** Update AndroidManifest.xml with permissions
  ```xml
  <!-- android/app/src/main/AndroidManifest.xml -->

  <!-- Internet -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

  <!-- Location -->
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

  <!-- Camera -->
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

  <!-- Bluetooth (for Bridgefy) -->
  <uses-permission android:name="android.permission.BLUETOOTH" />
  <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
  <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
  <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />

  <!-- Vibration -->
  <uses-permission android:name="android.permission.VIBRATE" />

  <!-- Push Notifications -->
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.WAKE_LOCK" />

  <!-- Microphone -->
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  ```

- [ ] **7.2.2** Update minimum SDK version
  ```groovy
  // android/app/build.gradle
  android {
      defaultConfig {
          minSdkVersion 24  // Android 7.0 (for Bridgefy)
          targetSdkVersion 34
      }
  }
  ```

- [ ] **7.2.3** Configure build types
  ```groovy
  // android/app/build.gradle
  android {
      buildTypes {
          debug {
              debuggable true
              minifyEnabled false
          }
          release {
              debuggable false
              minifyEnabled true
              proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
          }
      }
  }
  ```

### 7.3 Android Assets Configuration

- [ ] **7.3.1** Create app icons (all required densities)
  ```
  android/app/src/main/res/
  ├── mipmap-hdpi/    (72x72)
  ├── mipmap-mdpi/    (48x48)
  ├── mipmap-xhdpi/   (96x96)
  ├── mipmap-xxhdpi/  (144x144)
  ├── mipmap-xxxhdpi/ (192x192)
  └── mipmap-anydpi-v26/ (Adaptive icons)
  ```

- [ ] **7.3.2** Configure adaptive icons (Android 8.0+)
  ```xml
  <!-- android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml -->
  <?xml version="1.0" encoding="utf-8"?>
  <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
      <background android:drawable="@color/ic_launcher_background"/>
      <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  </adaptive-icon>
  ```

- [ ] **7.3.3** Create splash screen
  ```xml
  <!-- android/app/src/main/res/values/styles.xml -->
  <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
      <item name="android:background">@drawable/splash</item>
  </style>
  ```

- [ ] **7.3.4** Update app colors
  ```xml
  <!-- android/app/src/main/res/values/colors.xml -->
  <resources>
      <color name="colorPrimary">#EF4444</color>
      <color name="colorPrimaryDark">#DC2626</color>
      <color name="colorAccent">#EF4444</color>
      <color name="ic_launcher_background">#1F2937</color>
  </resources>
  ```

### 7.4 Android Build Configuration

- [ ] **7.4.1** Open Android Studio
  ```bash
  npx cap open android
  ```

- [ ] **7.4.2** Sync Gradle files
  ```
  File → Sync Project with Gradle Files
  ```

- [ ] **7.4.3** Configure signing for release
  ```groovy
  // android/app/build.gradle
  android {
      signingConfigs {
          release {
              storeFile file('keystore.jks')
              storePassword System.getenv('KEYSTORE_PASSWORD')
              keyAlias System.getenv('KEY_ALIAS')
              keyPassword System.getenv('KEY_PASSWORD')
          }
      }
      buildTypes {
          release {
              signingConfig signingConfigs.release
          }
      }
  }
  ```

- [ ] **7.4.4** Generate release keystore
  ```bash
  keytool -genkey -v -keystore tmt-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias tmt
  ```

### 7.5 Android Verification

- [ ] **7.5.1** Build Android project
  ```bash
  cd android
  ./gradlew assembleDebug
  # Expected: BUILD SUCCESSFUL
  ```

- [ ] **7.5.2** Run on Android Emulator
  ```bash
  npx cap run android
  ```

- [ ] **7.5.3** Test basic functionality
  - [ ] App launches
  - [ ] Navigation works
  - [ ] UI renders correctly
  - [ ] No console errors

---

## 8. Phase 5: Native Plugin Integration

### 8.1 Camera Integration

- [ ] **8.1.1** Create native camera service
  ```typescript
  // frontend/src/native/cameraService.ts
  import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
  import { isNative } from './platform';

  export interface CapturedPhoto {
    dataUrl: string;
    format: string;
    webPath?: string;
  }

  export async function capturePhoto(): Promise<CapturedPhoto | null> {
    try {
      if (!isNative) {
        // Fall back to file input on web
        return null;
      }

      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false
      });

      return {
        dataUrl: photo.dataUrl!,
        format: photo.format,
        webPath: photo.webPath
      };
    } catch (error) {
      console.error('Camera capture failed:', error);
      return null;
    }
  }

  export async function pickPhoto(): Promise<CapturedPhoto | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      return {
        dataUrl: photo.dataUrl!,
        format: photo.format,
        webPath: photo.webPath
      };
    } catch (error) {
      console.error('Photo pick failed:', error);
      return null;
    }
  }

  export async function checkCameraPermission(): Promise<boolean> {
    if (!isNative) return true;

    const permission = await Camera.checkPermissions();
    return permission.camera === 'granted';
  }

  export async function requestCameraPermission(): Promise<boolean> {
    if (!isNative) return true;

    const permission = await Camera.requestPermissions();
    return permission.camera === 'granted';
  }
  ```

- [ ] **8.1.2** Update CameraCapture component to use native
  ```typescript
  // Update src/components/sos/CameraCapture.tsx to use native when available
  ```

### 8.2 Geolocation Integration

- [ ] **8.2.1** Create native geolocation service
  ```typescript
  // frontend/src/native/geolocationService.ts
  import { Geolocation, Position } from '@capacitor/geolocation';
  import { isNative } from './platform';

  export interface GeoPosition {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }

  export async function getCurrentPosition(highAccuracy = true): Promise<GeoPosition> {
    if (!isNative) {
      // Use web API fallback
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp
          }),
          reject,
          { enableHighAccuracy: highAccuracy, timeout: 10000 }
        );
      });
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: highAccuracy,
      timeout: 10000
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp
    };
  }

  export function watchPosition(
    callback: (position: GeoPosition) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    if (!isNative) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => callback({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp
        }),
        errorCallback
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }

    let watchId: string | undefined;

    Geolocation.watchPosition(
      { enableHighAccuracy: true },
      (position, err) => {
        if (err) {
          errorCallback?.(new Error(err.message));
          return;
        }
        if (position) {
          callback({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          });
        }
      }
    ).then(id => { watchId = id; });

    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }

  export async function checkLocationPermission(): Promise<boolean> {
    if (!isNative) return true;

    const permission = await Geolocation.checkPermissions();
    return permission.location === 'granted';
  }

  export async function requestLocationPermission(): Promise<boolean> {
    if (!isNative) return true;

    const permission = await Geolocation.requestPermissions();
    return permission.location === 'granted';
  }
  ```

### 8.3 Push Notifications Integration

- [ ] **8.3.1** Create push notification service
  ```typescript
  // frontend/src/native/pushService.ts
  import { PushNotifications, Token, PushNotificationSchema } from '@capacitor/push-notifications';
  import { isNative } from './platform';

  export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, any>;
  }

  export async function initializePushNotifications(
    onToken: (token: string) => void,
    onNotification: (notification: PushNotificationPayload) => void
  ): Promise<boolean> {
    if (!isNative) {
      console.log('Push notifications not available on web');
      return false;
    }

    // Check permission
    let permission = await PushNotifications.checkPermissions();

    if (permission.receive !== 'granted') {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return false;
    }

    // Register for push
    await PushNotifications.register();

    // Handle registration
    PushNotifications.addListener('registration', (token: Token) => {
      console.log('Push registration success:', token.value);
      onToken(token.value);
    });

    // Handle registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    // Handle incoming notifications (app in foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      onNotification({
        title: notification.title || '',
        body: notification.body || '',
        data: notification.data
      });
    });

    // Handle notification tap
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action:', action);
      onNotification({
        title: action.notification.title || '',
        body: action.notification.body || '',
        data: action.notification.data
      });
    });

    return true;
  }
  ```

- [ ] **8.3.2** Create push notification hook
  ```typescript
  // frontend/src/hooks/usePushNotifications.ts
  ```

### 8.4 Local Notifications Integration

- [ ] **8.4.1** Create local notification service
  ```typescript
  // frontend/src/native/localNotificationService.ts
  import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';
  import { isNative } from './platform';

  export async function showLocalNotification(
    title: string,
    body: string,
    id?: number
  ): Promise<void> {
    if (!isNative) {
      // Web fallback using Notification API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return;
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: id || Date.now(),
        title,
        body,
        schedule: { at: new Date(Date.now() + 100) }
      }]
    });
  }

  export async function requestNotificationPermission(): Promise<boolean> {
    if (!isNative) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return false;
    }

    const permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted';
  }
  ```

### 8.5 Haptic Feedback Integration

- [ ] **8.5.1** Create haptic service
  ```typescript
  // frontend/src/native/hapticService.ts
  import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
  import { isNative } from './platform';

  export async function impactLight(): Promise<void> {
    if (!isNative) return;
    await Haptics.impact({ style: ImpactStyle.Light });
  }

  export async function impactMedium(): Promise<void> {
    if (!isNative) return;
    await Haptics.impact({ style: ImpactStyle.Medium });
  }

  export async function impactHeavy(): Promise<void> {
    if (!isNative) return;
    await Haptics.impact({ style: ImpactStyle.Heavy });
  }

  export async function notificationSuccess(): Promise<void> {
    if (!isNative) return;
    await Haptics.notification({ type: NotificationType.Success });
  }

  export async function notificationWarning(): Promise<void> {
    if (!isNative) return;
    await Haptics.notification({ type: NotificationType.Warning });
  }

  export async function notificationError(): Promise<void> {
    if (!isNative) return;
    await Haptics.notification({ type: NotificationType.Error });
  }

  export async function vibrate(): Promise<void> {
    if (!isNative) {
      if ('vibrate' in navigator) {
        navigator.vibrate(200);
      }
      return;
    }
    await Haptics.vibrate();
  }
  ```

### 8.6 Storage Integration

- [ ] **8.6.1** Create secure storage service
  ```typescript
  // frontend/src/native/storageService.ts
  import { Preferences } from '@capacitor/preferences';
  import { isNative } from './platform';

  export async function setItem(key: string, value: string): Promise<void> {
    if (!isNative) {
      localStorage.setItem(key, value);
      return;
    }
    await Preferences.set({ key, value });
  }

  export async function getItem(key: string): Promise<string | null> {
    if (!isNative) {
      return localStorage.getItem(key);
    }
    const { value } = await Preferences.get({ key });
    return value;
  }

  export async function removeItem(key: string): Promise<void> {
    if (!isNative) {
      localStorage.removeItem(key);
      return;
    }
    await Preferences.remove({ key });
  }

  export async function clear(): Promise<void> {
    if (!isNative) {
      localStorage.clear();
      return;
    }
    await Preferences.clear();
  }
  ```

### 8.7 Verification Tests

- [ ] **8.7.1** Create native services test file
  ```typescript
  // frontend/src/native/__tests__/services.test.ts
  ```

- [ ] **8.7.2** Run all tests
  ```bash
  npm run test:run
  # Expected: All tests passing
  ```

- [ ] **8.7.3** Build and sync
  ```bash
  npm run build:native
  ```

---

## 9. Phase 6: Bridgefy Bluetooth Mesh Integration

### 9.1 Bridgefy Account Setup

- [ ] **9.1.1** Create Bridgefy developer account
  - Visit: https://developer.bridgefy.me
  - Register organization account

- [ ] **9.1.2** Create new application in Bridgefy dashboard
  - App Name: TMT Emergency Response
  - Bundle ID (iOS): com.tmt.emergency
  - Package Name (Android): com.tmt.emergency

- [ ] **9.1.3** Obtain API credentials
  ```
  API Key: ________________
  License Key: ________________
  ```

- [ ] **9.1.4** Download Bridgefy SDKs
  - iOS SDK (Swift)
  - Android SDK (Kotlin)

### 9.2 Create Capacitor Bridgefy Plugin

- [ ] **9.2.1** Create plugin structure
  ```bash
  mkdir -p frontend/capacitor-plugins/bridgefy
  cd frontend/capacitor-plugins/bridgefy
  npm init capacitor-plugin@latest bridgefy-capacitor
  ```

- [ ] **9.2.2** Define plugin interface
  ```typescript
  // capacitor-plugins/bridgefy/src/definitions.ts
  export interface BridgefyPlugin {
    initialize(options: { apiKey: string; userId?: string }): Promise<{ success: boolean }>;
    start(): Promise<{ success: boolean }>;
    stop(): Promise<{ success: boolean }>;
    send(options: { message: string; userId?: string }): Promise<{ messageId: string }>;
    isStarted(): Promise<{ started: boolean }>;
    getNearbyPeers(): Promise<{ peers: BridgefyPeer[] }>;
    addListener(
      eventName: 'messageReceived',
      listener: (event: BridgefyMessage) => void
    ): Promise<PluginListenerHandle>;
    addListener(
      eventName: 'peerConnected',
      listener: (event: BridgefyPeer) => void
    ): Promise<PluginListenerHandle>;
    addListener(
      eventName: 'peerDisconnected',
      listener: (event: BridgefyPeer) => void
    ): Promise<PluginListenerHandle>;
    addListener(
      eventName: 'messageSent',
      listener: (event: { messageId: string }) => void
    ): Promise<PluginListenerHandle>;
    addListener(
      eventName: 'connectionStateChanged',
      listener: (event: { state: BridgefyState }) => void
    ): Promise<PluginListenerHandle>;
    removeAllListeners(): Promise<void>;
  }

  export interface BridgefyPeer {
    id: string;
    name?: string;
    rssi?: number;
  }

  export interface BridgefyMessage {
    messageId: string;
    senderId: string;
    content: string;
    timestamp: number;
  }

  export type BridgefyState = 'starting' | 'started' | 'stopping' | 'stopped' | 'error';
  ```

### 9.3 iOS Bridgefy Implementation

- [ ] **9.3.1** Add Bridgefy SDK to iOS project
  ```ruby
  # ios/App/Podfile
  pod 'BridgefySDK', '~> 2.0'
  ```

- [ ] **9.3.2** Implement iOS plugin
  ```swift
  // capacitor-plugins/bridgefy/ios/Plugin/BridgefyPlugin.swift
  import Foundation
  import Capacitor
  import BridgefySDK

  @objc(BridgefyPlugin)
  public class BridgefyPlugin: CAPPlugin {
      private var bridgefy: Bridgefy?

      @objc func initialize(_ call: CAPPluginCall) {
          guard let apiKey = call.getString("apiKey") else {
              call.reject("API key is required")
              return
          }

          let userId = call.getString("userId") ?? UUID().uuidString

          bridgefy = Bridgefy(apiKey: apiKey)
          bridgefy?.delegate = self

          call.resolve(["success": true])
      }

      @objc func start(_ call: CAPPluginCall) {
          bridgefy?.start()
          call.resolve(["success": true])
      }

      @objc func stop(_ call: CAPPluginCall) {
          bridgefy?.stop()
          call.resolve(["success": true])
      }

      @objc func send(_ call: CAPPluginCall) {
          guard let message = call.getString("message") else {
              call.reject("Message is required")
              return
          }

          let userId = call.getString("userId")

          if let userId = userId {
              // Direct message
              let messageId = bridgefy?.send(message.data(using: .utf8)!, to: userId)
              call.resolve(["messageId": messageId ?? ""])
          } else {
              // Broadcast
              let messageId = bridgefy?.broadcast(message.data(using: .utf8)!)
              call.resolve(["messageId": messageId ?? ""])
          }
      }

      // ... implement remaining methods
  }

  extension BridgefyPlugin: BridgefyDelegate {
      public func bridgefy(_ bridgefy: Bridgefy, didReceiveData data: Data, from userId: String) {
          let message = String(data: data, encoding: .utf8) ?? ""
          notifyListeners("messageReceived", data: [
              "messageId": UUID().uuidString,
              "senderId": userId,
              "content": message,
              "timestamp": Date().timeIntervalSince1970 * 1000
          ])
      }

      public func bridgefy(_ bridgefy: Bridgefy, didConnect userId: String) {
          notifyListeners("peerConnected", data: ["id": userId])
      }

      public func bridgefy(_ bridgefy: Bridgefy, didDisconnect userId: String) {
          notifyListeners("peerDisconnected", data: ["id": userId])
      }
  }
  ```

### 9.4 Android Bridgefy Implementation

- [ ] **9.4.1** Add Bridgefy SDK to Android project
  ```groovy
  // android/app/build.gradle
  dependencies {
      implementation 'me.bridgefy:android-sdk:2.0.0'
  }
  ```

- [ ] **9.4.2** Implement Android plugin
  ```kotlin
  // capacitor-plugins/bridgefy/android/src/main/java/com/tmt/bridgefy/BridgefyPlugin.kt
  package com.tmt.bridgefy

  import com.getcapacitor.*
  import com.getcapacitor.annotation.CapacitorPlugin
  import me.bridgefy.Bridgefy
  import me.bridgefy.BridgefyClient
  import me.bridgefy.BridgefyListener

  @CapacitorPlugin(name = "Bridgefy")
  class BridgefyPlugin : Plugin() {
      private var bridgefy: BridgefyClient? = null

      @PluginMethod
      fun initialize(call: PluginCall) {
          val apiKey = call.getString("apiKey") ?: run {
              call.reject("API key is required")
              return
          }

          val userId = call.getString("userId") ?: java.util.UUID.randomUUID().toString()

          bridgefy = Bridgefy.initialize(context, apiKey, object : BridgefyListener {
              override fun onMessageReceived(data: ByteArray, senderId: String) {
                  val message = String(data, Charsets.UTF_8)
                  val result = JSObject()
                  result.put("messageId", java.util.UUID.randomUUID().toString())
                  result.put("senderId", senderId)
                  result.put("content", message)
                  result.put("timestamp", System.currentTimeMillis())
                  notifyListeners("messageReceived", result)
              }

              override fun onPeerConnected(peerId: String) {
                  val result = JSObject()
                  result.put("id", peerId)
                  notifyListeners("peerConnected", result)
              }

              override fun onPeerDisconnected(peerId: String) {
                  val result = JSObject()
                  result.put("id", peerId)
                  notifyListeners("peerDisconnected", result)
              }
          })

          call.resolve(JSObject().apply { put("success", true) })
      }

      @PluginMethod
      fun start(call: PluginCall) {
          bridgefy?.start()
          call.resolve(JSObject().apply { put("success", true) })
      }

      @PluginMethod
      fun stop(call: PluginCall) {
          bridgefy?.stop()
          call.resolve(JSObject().apply { put("success", true) })
      }

      @PluginMethod
      fun send(call: PluginCall) {
          val message = call.getString("message") ?: run {
              call.reject("Message is required")
              return
          }

          val userId = call.getString("userId")
          val messageId = if (userId != null) {
              bridgefy?.send(message.toByteArray(), userId)
          } else {
              bridgefy?.broadcast(message.toByteArray())
          }

          call.resolve(JSObject().apply { put("messageId", messageId ?: "") })
      }
  }
  ```

### 9.5 JavaScript/TypeScript Wrapper

- [ ] **9.5.1** Create Bridgefy service
  ```typescript
  // frontend/src/native/bridgefyService.ts
  import { registerPlugin } from '@capacitor/core';
  import type { BridgefyPlugin, BridgefyMessage, BridgefyPeer, BridgefyState } from 'bridgefy-capacitor';
  import { isNative } from './platform';

  const Bridgefy = registerPlugin<BridgefyPlugin>('Bridgefy');

  interface BridgefyConfig {
    apiKey: string;
    userId?: string;
    onMessage?: (message: BridgefyMessage) => void;
    onPeerConnected?: (peer: BridgefyPeer) => void;
    onPeerDisconnected?: (peer: BridgefyPeer) => void;
    onStateChange?: (state: BridgefyState) => void;
  }

  let isInitialized = false;
  let isRunning = false;

  export async function initializeBridgefy(config: BridgefyConfig): Promise<boolean> {
    if (!isNative) {
      console.warn('Bridgefy is only available on native platforms');
      return false;
    }

    try {
      await Bridgefy.initialize({
        apiKey: config.apiKey,
        userId: config.userId
      });

      // Set up listeners
      if (config.onMessage) {
        await Bridgefy.addListener('messageReceived', config.onMessage);
      }
      if (config.onPeerConnected) {
        await Bridgefy.addListener('peerConnected', config.onPeerConnected);
      }
      if (config.onPeerDisconnected) {
        await Bridgefy.addListener('peerDisconnected', config.onPeerDisconnected);
      }
      if (config.onStateChange) {
        await Bridgefy.addListener('connectionStateChanged', (event) => {
          config.onStateChange!(event.state);
        });
      }

      isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Bridgefy:', error);
      return false;
    }
  }

  export async function startBridgefy(): Promise<boolean> {
    if (!isNative || !isInitialized) return false;

    try {
      await Bridgefy.start();
      isRunning = true;
      return true;
    } catch (error) {
      console.error('Failed to start Bridgefy:', error);
      return false;
    }
  }

  export async function stopBridgefy(): Promise<void> {
    if (!isNative || !isRunning) return;

    try {
      await Bridgefy.stop();
      isRunning = false;
    } catch (error) {
      console.error('Failed to stop Bridgefy:', error);
    }
  }

  export async function sendMessage(message: string, userId?: string): Promise<string | null> {
    if (!isNative || !isRunning) return null;

    try {
      const result = await Bridgefy.send({ message, userId });
      return result.messageId;
    } catch (error) {
      console.error('Failed to send message:', error);
      return null;
    }
  }

  export async function broadcastSOS(sosData: {
    type: string;
    location: { lat: number; lng: number };
    message?: string;
    timestamp: number;
  }): Promise<string | null> {
    const encodedMessage = JSON.stringify({
      type: 'TMT_SOS',
      payload: sosData
    });
    return sendMessage(encodedMessage);
  }

  export async function getNearbyPeers(): Promise<BridgefyPeer[]> {
    if (!isNative || !isRunning) return [];

    try {
      const result = await Bridgefy.getNearbyPeers();
      return result.peers;
    } catch (error) {
      console.error('Failed to get nearby peers:', error);
      return [];
    }
  }

  export function isBridgefyAvailable(): boolean {
    return isNative;
  }

  export function isBridgefyRunning(): boolean {
    return isRunning;
  }
  ```

### 9.6 SOS Fallback Integration

- [ ] **9.6.1** Update SOS service with Bridgefy fallback
  ```typescript
  // frontend/src/services/sosService.ts (update existing)
  // Add Bridgefy as third fallback layer
  ```

- [ ] **9.6.2** Create Bridgefy hook
  ```typescript
  // frontend/src/hooks/useBridgefy.ts
  import { useState, useEffect, useCallback } from 'react';
  import * as bridgefy from '../native/bridgefyService';
  import type { BridgefyMessage, BridgefyPeer } from 'bridgefy-capacitor';

  interface UseBridgefyOptions {
    autoStart?: boolean;
    apiKey: string;
    userId?: string;
  }

  export function useBridgefy(options: UseBridgefyOptions) {
    const [isAvailable, setIsAvailable] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [peers, setPeers] = useState<BridgefyPeer[]>([]);
    const [messages, setMessages] = useState<BridgefyMessage[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setIsAvailable(bridgefy.isBridgefyAvailable());
    }, []);

    useEffect(() => {
      if (!isAvailable) return;

      const init = async () => {
        const success = await bridgefy.initializeBridgefy({
          apiKey: options.apiKey,
          userId: options.userId,
          onMessage: (message) => {
            setMessages(prev => [...prev, message]);
          },
          onPeerConnected: (peer) => {
            setPeers(prev => [...prev, peer]);
          },
          onPeerDisconnected: (peer) => {
            setPeers(prev => prev.filter(p => p.id !== peer.id));
          },
          onStateChange: (state) => {
            setIsRunning(state === 'started');
          }
        });

        if (success && options.autoStart) {
          await bridgefy.startBridgefy();
        }
      };

      init();

      return () => {
        bridgefy.stopBridgefy();
      };
    }, [isAvailable, options.apiKey, options.userId, options.autoStart]);

    const start = useCallback(async () => {
      const success = await bridgefy.startBridgefy();
      if (!success) {
        setError('Failed to start Bridgefy');
      }
      return success;
    }, []);

    const stop = useCallback(async () => {
      await bridgefy.stopBridgefy();
    }, []);

    const sendSOS = useCallback(async (sosData: {
      type: string;
      location: { lat: number; lng: number };
      message?: string;
    }) => {
      return bridgefy.broadcastSOS({
        ...sosData,
        timestamp: Date.now()
      });
    }, []);

    return {
      isAvailable,
      isRunning,
      peers,
      messages,
      error,
      start,
      stop,
      sendSOS,
      peerCount: peers.length
    };
  }
  ```

### 9.7 Bridgefy Verification

- [ ] **9.7.1** Create Bridgefy test component
  ```typescript
  // frontend/src/components/debug/BridgefyTest.tsx
  ```

- [ ] **9.7.2** Test on physical iOS device
  - [ ] Bridgefy initializes
  - [ ] Bluetooth permission granted
  - [ ] Mesh networking starts
  - [ ] Can detect nearby devices
  - [ ] Can send/receive messages

- [ ] **9.7.3** Test on physical Android device
  - [ ] Bridgefy initializes
  - [ ] Bluetooth permission granted
  - [ ] Mesh networking starts
  - [ ] Can detect nearby devices
  - [ ] Can send/receive messages

- [ ] **9.7.4** Test cross-platform communication
  - [ ] iOS to Android
  - [ ] Android to iOS
  - [ ] Multi-hop relay

---

## 10. Phase 7: Testing & Quality Assurance

### 10.1 Unit Testing

- [ ] **10.1.1** Add native service mocks
  ```typescript
  // frontend/src/native/__mocks__/platform.ts
  export const isNative = false;
  export const isIOS = false;
  export const isAndroid = false;
  export const isWeb = true;
  export const getPlatformName = () => 'web' as const;
  ```

- [ ] **10.1.2** Create native service tests
  ```bash
  frontend/src/native/__tests__/
  ├── platform.test.ts
  ├── deviceService.test.ts
  ├── networkService.test.ts
  ├── cameraService.test.ts
  ├── geolocationService.test.ts
  ├── pushService.test.ts
  ├── hapticService.test.ts
  ├── storageService.test.ts
  └── bridgefyService.test.ts
  ```

- [ ] **10.1.3** Run full test suite
  ```bash
  npm run test:run
  # Target: 100+ tests passing (84 original + new native tests)
  ```

- [ ] **10.1.4** Generate coverage report
  ```bash
  npm run test:coverage
  # Target: >80% coverage
  ```

### 10.2 Integration Testing

- [ ] **10.2.1** Test SOS flow with all fallbacks
  ```
  Scenario: Internet → Success
  Scenario: Internet fail → SMS → Success
  Scenario: Internet fail → SMS fail → Bluetooth → Success
  Scenario: All fail → Queue for retry
  ```

- [ ] **10.2.2** Test offline mode
  - [ ] Enable airplane mode
  - [ ] Submit SOS
  - [ ] Verify queued in IndexedDB
  - [ ] Re-enable network
  - [ ] Verify automatic sync

- [ ] **10.2.3** Test push notifications
  - [ ] Receive notification (app foreground)
  - [ ] Receive notification (app background)
  - [ ] Tap notification → correct navigation

- [ ] **10.2.4** Test camera functionality
  - [ ] Capture photo
  - [ ] Select from gallery
  - [ ] Photo attached to SOS

- [ ] **10.2.5** Test geolocation
  - [ ] Get current location
  - [ ] Watch location (responder tracking)
  - [ ] Background location updates

### 10.3 UI/UX Testing

- [ ] **10.3.1** Test on multiple screen sizes
  - [ ] iPhone SE (small)
  - [ ] iPhone 15 Pro (standard)
  - [ ] iPhone 15 Pro Max (large)
  - [ ] iPad (tablet)
  - [ ] Various Android devices

- [ ] **10.3.2** Test dark mode compatibility
  - [ ] System dark mode
  - [ ] UI readable
  - [ ] Colors appropriate

- [ ] **10.3.3** Test RTL layout (Arabic)
  - [ ] Text alignment
  - [ ] Navigation
  - [ ] Icons/buttons

- [ ] **10.3.4** Test accessibility
  - [ ] VoiceOver (iOS)
  - [ ] TalkBack (Android)
  - [ ] Dynamic type sizing

### 10.4 Performance Testing

- [ ] **10.4.1** Measure app launch time
  ```
  Target: < 2 seconds cold start
  ```

- [ ] **10.4.2** Measure memory usage
  ```
  Target: < 150MB active
  ```

- [ ] **10.4.3** Test battery impact
  - [ ] Normal usage (1 hour)
  - [ ] Background location tracking
  - [ ] Bluetooth mesh active

- [ ] **10.4.4** Test network performance
  - [ ] 3G conditions
  - [ ] Poor WiFi
  - [ ] Intermittent connectivity

### 10.5 Security Testing

- [ ] **10.5.1** Verify HTTPS only
- [ ] **10.5.2** Test secure storage encryption
- [ ] **10.5.3** Verify no sensitive data in logs
- [ ] **10.5.4** Test session management
- [ ] **10.5.5** Verify API token handling

---

## 11. Phase 8: App Store Preparation

### 11.1 iOS App Store Requirements

- [ ] **11.1.1** Create Apple Developer account
  - [ ] Individual or Organization account
  - [ ] Verify account active

- [ ] **11.1.2** Create App Store Connect record
  - [ ] App Name: TMT - Emergency Response
  - [ ] Bundle ID: com.tmt.emergency
  - [ ] SKU: tmt-emergency-001

- [ ] **11.1.3** Prepare app metadata
  - [ ] App description (4000 chars max)
  - [ ] Keywords (100 chars max)
  - [ ] Support URL
  - [ ] Privacy Policy URL
  - [ ] App category: Medical/Utilities

- [ ] **11.1.4** Create screenshots
  ```
  Required sizes:
  - iPhone 6.7" (1290 x 2796)
  - iPhone 6.5" (1284 x 2778)
  - iPhone 5.5" (1242 x 2208)
  - iPad Pro 12.9" (2048 x 2732)
  - iPad Pro 11" (1668 x 2388)
  ```

- [ ] **11.1.5** Create App Preview video (optional)
  - 30 second max
  - Shows SOS flow

- [ ] **11.1.6** Configure capabilities in Xcode
  - [ ] Push Notifications
  - [ ] Background Modes
  - [ ] Associated Domains (if needed)

- [ ] **11.1.7** Archive and upload build
  ```bash
  # In Xcode:
  Product → Archive
  Distribute App → App Store Connect
  ```

### 11.2 Google Play Store Requirements

- [ ] **11.2.1** Create Google Play Developer account
  - [ ] $25 registration fee paid
  - [ ] Account verified

- [ ] **11.2.2** Create app in Play Console
  - [ ] App Name: TMT - Emergency Response
  - [ ] Default language: English
  - [ ] App or game: App
  - [ ] Free or paid: Free

- [ ] **11.2.3** Prepare store listing
  - [ ] Short description (80 chars)
  - [ ] Full description (4000 chars)
  - [ ] App category: Medical/Utilities
  - [ ] Contact email
  - [ ] Privacy Policy URL

- [ ] **11.2.4** Create graphic assets
  ```
  Required:
  - Feature graphic (1024 x 500)
  - Phone screenshots (min 2, max 8)
  - 7" tablet screenshots
  - 10" tablet screenshots
  ```

- [ ] **11.2.5** Complete content rating questionnaire

- [ ] **11.2.6** Set up app signing
  - [ ] Google Play App Signing enabled
  - [ ] Upload key configured

- [ ] **11.2.7** Build release APK/AAB
  ```bash
  cd android
  ./gradlew bundleRelease
  # Output: app/build/outputs/bundle/release/app-release.aab
  ```

- [ ] **11.2.8** Upload to Play Console

### 11.3 Privacy & Legal

- [ ] **11.3.1** Create Privacy Policy
  - Data collected
  - Location tracking
  - Camera usage
  - Bluetooth usage
  - Data retention

- [ ] **11.3.2** Create Terms of Service

- [ ] **11.3.3** iOS App Privacy details
  - [ ] Data types collected
  - [ ] Data linked to user
  - [ ] Tracking disclosure

- [ ] **11.3.4** Android Data Safety section
  - [ ] Data collection
  - [ ] Data sharing
  - [ ] Security practices

### 11.4 Compliance

- [ ] **11.4.1** GDPR compliance (if applicable)
- [ ] **11.4.2** CCPA compliance (if applicable)
- [ ] **11.4.3** Emergency services disclaimer
- [ ] **11.4.4** Export compliance (encryption)

---

## 12. Phase 9: Deployment & Release

### 12.1 Pre-Release Checklist

- [ ] **12.1.1** All tests passing
- [ ] **12.1.2** No critical bugs
- [ ] **12.1.3** Performance acceptable
- [ ] **12.1.4** Security audit complete
- [ ] **12.1.5** Documentation updated
- [ ] **12.1.6** Release notes prepared

### 12.2 iOS Release

- [ ] **12.2.1** Submit for App Review
- [ ] **12.2.2** Respond to review feedback (if any)
- [ ] **12.2.3** App approved
- [ ] **12.2.4** Release to App Store
- [ ] **12.2.5** Verify live listing

### 12.3 Android Release

- [ ] **12.3.1** Submit for review
- [ ] **12.3.2** Respond to review feedback (if any)
- [ ] **12.3.3** App approved
- [ ] **12.3.4** Release to Play Store
- [ ] **12.3.5** Verify live listing

### 12.4 Post-Release

- [ ] **12.4.1** Monitor crash reports
- [ ] **12.4.2** Monitor user feedback
- [ ] **12.4.3** Set up analytics
- [ ] **12.4.4** Plan update schedule

---

## 13. Risk Management

### 13.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Bridgefy SDK incompatibility | High | Medium | Have SMS-only fallback ready |
| iOS App Store rejection | High | Low | Follow guidelines strictly |
| Play Store rejection | High | Low | Complete all compliance |
| Performance issues | Medium | Medium | Profile and optimize |
| Battery drain | Medium | High | Optimize background tasks |

### 13.2 Rollback Plan

If critical issues discovered post-release:
1. Keep PWA available as fallback
2. Force update mechanism in app
3. Server-side feature flags for disabling features

---

## 14. Appendices

### 14.1 Command Reference

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Build web assets
npm run build:native           # Build + sync native

# Capacitor
npx cap sync                   # Sync web to native
npx cap sync ios               # Sync iOS only
npx cap sync android           # Sync Android only
npx cap open ios               # Open Xcode
npx cap open android           # Open Android Studio
npx cap run ios                # Run on iOS
npx cap run android            # Run on Android

# Testing
npm run test:run               # Run all tests
npm run test:coverage          # Coverage report

# iOS
cd ios/App && pod install      # Install pods
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release archive

# Android
cd android && ./gradlew assembleDebug   # Debug build
cd android && ./gradlew bundleRelease   # Release bundle
```

### 14.2 Environment Variables

```env
# Required
VITE_API_URL=https://api.tmt.example.com
VITE_WS_URL=wss://api.tmt.example.com
VITE_BRIDGEFY_API_KEY=your_api_key

# Optional
VITE_SMS_GATEWAY_NUMBER=+15551234567
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_PROJECT_ID=xxx
```

### 14.3 File Structure (Final)

```
frontend/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── native/                 # NEW: Native services
│   │   ├── platform.ts
│   │   ├── deviceService.ts
│   │   ├── networkService.ts
│   │   ├── cameraService.ts
│   │   ├── geolocationService.ts
│   │   ├── pushService.ts
│   │   ├── hapticService.ts
│   │   ├── storageService.ts
│   │   ├── bridgefyService.ts
│   │   └── __tests__/
│   ├── pages/
│   ├── store/
│   ├── types/
│   └── utils/
├── capacitor-plugins/          # NEW: Custom plugins
│   └── bridgefy/
├── ios/                        # NEW: iOS project
│   └── App/
├── android/                    # NEW: Android project
│   └── app/
├── capacitor.config.ts         # NEW: Capacitor config
├── package.json
└── vite.config.ts
```

---

## Progress Tracking

### Overall Status

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Pre-Conversion | ⬜ Not Started | 0% |
| Phase 2: Capacitor Setup | ⬜ Not Started | 0% |
| Phase 3: iOS Configuration | ⬜ Not Started | 0% |
| Phase 4: Android Configuration | ⬜ Not Started | 0% |
| Phase 5: Native Plugins | ⬜ Not Started | 0% |
| Phase 6: Bridgefy Integration | ⬜ Not Started | 0% |
| Phase 7: Testing | ⬜ Not Started | 0% |
| Phase 8: App Store Prep | ⬜ Not Started | 0% |
| Phase 9: Deployment | ⬜ Not Started | 0% |

**Total Progress: 0%**

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-15 | 1.0.0 | Initial plan created |

---

*Document maintained by: Development Team*
*Last updated: 2026-02-15*
