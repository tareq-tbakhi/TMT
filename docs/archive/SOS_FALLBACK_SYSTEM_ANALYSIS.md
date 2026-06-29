# SOS Multi-Fallback System Analysis

## Executive Summary

This document provides a comprehensive analysis of implementing a resilient SOS emergency system with three communication fallback layers:

1. **Primary**: Internet (WebSocket/HTTP API)
2. **Secondary**: SMS (Cellular Network)
3. **Tertiary**: Bluetooth Mesh (Bridgefy SDK)

The goal is to ensure emergency signals are delivered even in complete infrastructure failure scenarios.

---

## Current System Architecture

### What Exists Today

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT SOS FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Patient App                                                   │
│       │                                                         │
│       ├──[Internet]──► Backend API ──► WebSocket Broadcast      │
│       │                    │                                    │
│       │                    ▼                                    │
│       │              Celery Task                                │
│       │                    │                                    │
│       │                    ▼                                    │
│       │              AI Triage (CrewAI)                         │
│       │                    │                                    │
│       │                    ▼                                    │
│       │         Department Routing + Alert                      │
│       │                                                         │
│       └──[SMS Fallback]──► Native SMS App (Manual)              │
│              (Encrypted payload, requires manual send)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Current Capabilities

| Layer | Implementation | Status |
|-------|---------------|--------|
| Internet API | POST /sos endpoint | ✅ Complete |
| WebSocket | Real-time broadcast | ✅ Complete |
| AI Triage | CrewAI multi-agent | ✅ Complete |
| SMS Send | Encrypted payload | ⚠️ Partial (client-side only) |
| SMS Receive | Backend parsing | ❌ Not implemented |
| Bluetooth | Not implemented | ❌ Not implemented |

---

## Proposed Multi-Fallback Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROPOSED MULTI-FALLBACK SOS SYSTEM                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐                                                    │
│  │   Patient App   │                                                    │
│  │                 │                                                    │
│  │  Connection     │                                                    │
│  │  Manager        │──── Monitors: WiFi, Cellular, Bluetooth            │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           ▼                                                             │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                    FALLBACK CHAIN                              │     │
│  │                                                                │     │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐     │     │
│  │  │ LAYER 1  │    │ LAYER 2  │    │      LAYER 3         │     │     │
│  │  │ Internet │───►│   SMS    │───►│  Bluetooth Mesh      │     │     │
│  │  │          │    │          │    │    (Bridgefy)        │     │     │
│  │  └────┬─────┘    └────┬─────┘    └──────────┬───────────┘     │     │
│  │       │               │                      │                 │     │
│  └───────┼───────────────┼──────────────────────┼─────────────────┘     │
│          │               │                      │                       │
│          ▼               ▼                      ▼                       │
│  ┌──────────────┐ ┌──────────────┐  ┌─────────────────────────────┐     │
│  │ Backend API  │ │ SMS Gateway  │  │    Bridgefy Cloud Relay     │     │
│  │              │ │  (Twilio)    │  │                             │     │
│  │ WebSocket    │ │              │  │ ┌─────────┐  ┌────────────┐ │     │
│  │ Celery       │ │ Webhook      │  │ │ Mesh    │  │ Internet   │ │     │
│  │ PostgreSQL   │ │ Parser       │  │ │ Relay   │  │ Bridge     │ │     │
│  └──────┬───────┘ └──────┬───────┘  │ └────┬────┘  └─────┬──────┘ │     │
│         │                │          │      │             │        │     │
│         └────────────────┴──────────┴──────┴─────────────┘        │     │
│                          │                                        │     │
│                          ▼                                        │     │
│                 ┌─────────────────┐                               │     │
│                 │  Unified SOS    │                               │     │
│                 │  Processing     │                               │     │
│                 │  Pipeline       │                               │     │
│                 └────────┬────────┘                               │     │
│                          │                                        │     │
│                          ▼                                        │     │
│            ┌──────────────────────────────┐                       │     │
│            │     AI Triage + Routing      │                       │     │
│            │  (Handles all 3 sources)     │                       │     │
│            └──────────────────────────────┘                       │     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Internet (Primary)

### Current Implementation
- **Protocol**: HTTPS POST + WebSocket
- **Endpoint**: `POST /api/v1/sos`
- **Real-time**: Socket.IO broadcast
- **Latency**: ~100-500ms

### Enhancements Needed

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Connection Quality Monitor | High | Track RTT, packet loss, bandwidth |
| Offline Queue | High | IndexedDB with sync (exists but needs hardening) |
| Retry with Backoff | Medium | Exponential backoff (1s → 2s → 4s → 8s) |
| Compression | Low | Brotli/gzip for payload optimization |

### Internet Detection Strategy

```typescript
// Enhanced connection monitoring
interface ConnectionQuality {
  type: 'wifi' | 'cellular' | 'ethernet' | 'none';
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number;      // Mbps
  rtt: number;           // Round-trip time ms
  saveData: boolean;     // Data saver mode
  isOnline: boolean;     // Navigator.onLine
  lastSuccessfulPing: number;  // Timestamp
}

// Thresholds for fallback trigger
const FALLBACK_THRESHOLDS = {
  maxRtt: 5000,          // 5 seconds
  minDownlink: 0.1,      // 100 Kbps minimum
  maxRetries: 3,         // Before fallback
  pingInterval: 10000,   // Health check every 10s
};
```

---

## Layer 2: SMS (Secondary)

### Current Implementation
- **Client**: Prepares encrypted SMS payload
- **Format**: `TMT:v1:<base64-encrypted-json>`
- **Delivery**: Opens native SMS app via `sms:` URI
- **Limitation**: User must manually send

### Required Enhancements

#### A. SMS Gateway Integration (Backend)

**Recommended Provider**: Twilio (or local provider for Jordan)

```python
# backend/app/services/sms_gateway.py

from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse

class SMSGatewayService:
    """
    SMS Gateway for receiving and parsing SOS messages
    """

    def __init__(self):
        self.client = Client(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN
        )
        self.tmt_number = settings.TMT_SMS_NUMBER

    async def receive_sms(self, from_number: str, body: str) -> dict:
        """
        Parse incoming SMS and create SOS request
        """
        # Check for TMT protocol
        if not body.startswith("TMT:"):
            return {"error": "Invalid TMT message format"}

        # Parse version and payload
        parts = body.split(":")
        version = parts[1]
        encrypted_payload = parts[2]

        # Decrypt and parse
        sos_data = self._decrypt_payload(encrypted_payload, from_number)

        # Create SOS request
        sos_request = await self._create_sos_from_sms(
            phone=from_number,
            data=sos_data
        )

        return sos_request

    async def send_acknowledgment(self, to_number: str, sos_id: str):
        """
        Send SMS confirmation back to user
        """
        message = self.client.messages.create(
            body=f"TMT: SOS received. ID: {sos_id[:8]}. Help is on the way.",
            from_=self.tmt_number,
            to=to_number
        )
        return message.sid
```

#### B. SMS Webhook Endpoint

```python
# backend/app/api/routes/sms.py

from fastapi import APIRouter, Request, Response
from app.services.sms_gateway import SMSGatewayService

router = APIRouter(prefix="/sms", tags=["SMS"])

@router.post("/webhook/twilio")
async def twilio_webhook(request: Request):
    """
    Twilio webhook for incoming SMS
    """
    form_data = await request.form()

    from_number = form_data.get("From")
    body = form_data.get("Body")

    sms_service = SMSGatewayService()
    result = await sms_service.receive_sms(from_number, body)

    if "error" not in result:
        # Trigger triage pipeline
        triage_sos_request.delay(result)

        # Send acknowledgment
        await sms_service.send_acknowledgment(from_number, result["id"])

    # Return TwiML response
    response = MessagingResponse()
    return Response(content=str(response), media_type="application/xml")
```

#### C. Enhanced SMS Payload Format

```typescript
// Compact SMS format for limited character count (160 chars)
interface CompactSOSPayload {
  v: 2;                    // Version
  u: string;               // User ID (8 chars)
  p: string;               // Phone hash (for verification)
  l: {
    a: number;             // Latitude (5 decimal places)
    o: number;             // Longitude (5 decimal places)
    c: number;             // Accuracy meters
  };
  s: number;               // Severity (1-5)
  t: string;               // Status code (S=safe, I=injured, T=trapped, E=evacuate)
  d?: string;              // Details (truncated, max 50 chars)
  ts: number;              // Unix timestamp (seconds, not ms)
}

// Example encoded: ~90 chars before encryption
// TMT:2:eyJ2IjoyLCJ1IjoiYWJjZDEyMzQiLCJwIjoieDd5OCIsImwiOnsiYSI6MzEuOTUzOSwibyI6MzUuOTEwNiwiYyI6MTB9LCJzIjo0LCJ0IjoiSSIsInRzIjoxNzA3OTk5OTk5fQ==
```

#### D. Automatic SMS Send (No User Interaction)

For critical situations, implement background SMS sending:

```typescript
// services/autoSMSService.ts

import { Capacitor } from '@capacitor/core';
import { SMS } from '@capacitor-community/sms';

export class AutoSMSService {
  private static TMT_NUMBER = '+970599000000';

  /**
   * Send SMS without user interaction (requires native app permissions)
   */
  static async sendAutomaticSOS(payload: CompactSOSPayload): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      // Web fallback - open SMS app
      return this.openSMSApp(payload);
    }

    try {
      // Native automatic send (requires SMS permission)
      await SMS.send({
        numbers: [this.TMT_NUMBER],
        text: this.encodePayload(payload),
      });
      return true;
    } catch (error) {
      console.error('Auto SMS failed:', error);
      return false;
    }
  }

  /**
   * Fallback: Open SMS app with pre-filled message
   */
  static openSMSApp(payload: CompactSOSPayload): boolean {
    const encoded = this.encodePayload(payload);
    const smsUri = `sms:${this.TMT_NUMBER}?body=${encodeURIComponent(encoded)}`;

    window.location.href = smsUri;
    return true;
  }
}
```

---

## Layer 3: Bluetooth Mesh (Bridgefy)

### What is Bridgefy?

Bridgefy is a mesh networking SDK that enables device-to-device communication without internet or cellular connectivity. Messages hop between nearby devices until they reach one with internet access.

### Key Features

| Feature | Description | Benefit for TMT |
|---------|-------------|-----------------|
| Mesh Networking | Messages hop between devices | SOS reaches help even without direct connectivity |
| Offline Messaging | No internet required | Works in disaster/blackout scenarios |
| Encryption | End-to-end encrypted | Secure SOS transmission |
| Range | ~100m per hop, unlimited hops | City-wide coverage with enough users |
| Internet Bridge | Online devices relay to servers | Eventually consistent delivery |

### Bridgefy Architecture for TMT

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BRIDGEFY MESH NETWORK                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   DISASTER ZONE (No Internet/Cellular)                                  │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │                                                             │       │
│   │  [Patient A]                              [Patient C]       │       │
│   │      │                                        │             │       │
│   │      │ BLE                                    │ BLE         │       │
│   │      ▼                                        ▼             │       │
│   │  [Relay Device]◄──── BLE Mesh ────►[Relay Device]           │       │
│   │      │                                        │             │       │
│   │      │                                        │             │       │
│   │      └────────────────┬───────────────────────┘             │       │
│   │                       │                                     │       │
│   └───────────────────────┼─────────────────────────────────────┘       │
│                           │                                             │
│                           │ BLE Hop                                     │
│                           ▼                                             │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  EDGE ZONE (Partial Connectivity)                           │       │
│   │                                                             │       │
│   │  [Responder Device]◄──── WiFi Available ────►[Internet]     │       │
│   │      │                                            │         │       │
│   │      │ Bridgefy SDK                              │         │       │
│   │      ▼                                            ▼         │       │
│   │  [Forward to Cloud]────────────────────►[TMT Backend]       │       │
│   │                                                             │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Bridgefy Integration Plan

#### A. Native App Requirements

Bridgefy SDK requires native mobile apps (not PWA):

| Platform | SDK | Requirements |
|----------|-----|--------------|
| iOS | BridgefySDK (Swift/ObjC) | iOS 13+, Bluetooth LE |
| Android | BridgefySDK (Kotlin/Java) | Android 6.0+, Bluetooth LE |

**Recommendation**: Use React Native or Capacitor to wrap existing web app with native Bluetooth capabilities.

#### B. Bridgefy Message Types

```typescript
// types/bridgefyTypes.ts

interface BridgefySOSMessage {
  type: 'sos';
  version: 1;
  messageId: string;      // UUID for deduplication

  // Sender info
  senderId: string;       // TMT patient ID
  senderPublicKey: string;// For E2E encryption

  // SOS data (compact)
  payload: {
    lat: number;
    lng: number;
    accuracy: number;
    severity: 1 | 2 | 3 | 4 | 5;
    status: 'S' | 'I' | 'T' | 'E';
    timestamp: number;
    details?: string;     // Max 100 chars
  };

  // Routing metadata
  ttl: number;            // Time-to-live (hops remaining)
  hops: number;           // Hops taken so far
  routedVia: string[];    // Device IDs that relayed

  // Targeting
  target: 'broadcast' | 'responders' | 'specific';
  targetIds?: string[];   // For specific targeting
}

interface BridgefyAckMessage {
  type: 'sos_ack';
  originalMessageId: string;
  acknowledgedBy: 'backend' | 'responder';
  responderId?: string;
  eta?: number;           // Minutes
  timestamp: number;
}

interface BridgefyStatusUpdate {
  type: 'status_update';
  sosId: string;
  newStatus: 'dispatched' | 'en_route' | 'on_scene' | 'resolved';
  responderType: 'ambulance' | 'police' | 'civil_defense' | 'firefighter';
  timestamp: number;
}
```

#### C. Bridgefy Service Implementation

```typescript
// services/bridgefyService.ts

import { Bridgefy, BridgefyMessage, ConnectionState } from 'bridgefy-react-native';

export class BridgefyService {
  private static instance: BridgefyService;
  private bridgefy: Bridgefy;
  private userId: string;
  private isInitialized: boolean = false;
  private messageQueue: BridgefySOSMessage[] = [];

  // Singleton pattern
  static getInstance(): BridgefyService {
    if (!BridgefyService.instance) {
      BridgefyService.instance = new BridgefyService();
    }
    return BridgefyService.instance;
  }

  /**
   * Initialize Bridgefy SDK
   */
  async initialize(userId: string, apiKey: string): Promise<void> {
    this.userId = userId;

    try {
      this.bridgefy = new Bridgefy(apiKey);

      // Set up event listeners
      this.bridgefy.on('messageReceived', this.handleMessageReceived.bind(this));
      this.bridgefy.on('messageSent', this.handleMessageSent.bind(this));
      this.bridgefy.on('connectionStateChanged', this.handleConnectionChange.bind(this));
      this.bridgefy.on('deviceConnected', this.handleDeviceConnected.bind(this));

      // Start the SDK
      await this.bridgefy.start({
        userId: userId,
        propagationProfile: 'standard', // or 'long_reach' for emergencies
      });

      this.isInitialized = true;

      // Process queued messages
      this.processQueue();

    } catch (error) {
      console.error('Bridgefy initialization failed:', error);
      throw error;
    }
  }

  /**
   * Send SOS via Bluetooth mesh
   */
  async sendSOS(sosData: SOSPayload): Promise<string> {
    const message: BridgefySOSMessage = {
      type: 'sos',
      version: 1,
      messageId: crypto.randomUUID(),
      senderId: this.userId,
      senderPublicKey: await this.getPublicKey(),
      payload: {
        lat: sosData.latitude,
        lng: sosData.longitude,
        accuracy: sosData.accuracy || 10,
        severity: sosData.severity,
        status: this.mapStatus(sosData.patientStatus),
        timestamp: Date.now(),
        details: sosData.details?.substring(0, 100),
      },
      ttl: 15,              // Max 15 hops
      hops: 0,
      routedVia: [],
      target: 'broadcast',  // Reach all nearby devices
    };

    if (!this.isInitialized) {
      // Queue for later
      this.messageQueue.push(message);
      return message.messageId;
    }

    // Send via mesh
    await this.bridgefy.send(
      JSON.stringify(message),
      'broadcast'           // All nearby devices
    );

    // Also send to known responder devices if available
    const responderDevices = await this.getKnownResponders();
    for (const deviceId of responderDevices) {
      await this.bridgefy.send(
        JSON.stringify(message),
        deviceId
      );
    }

    return message.messageId;
  }

  /**
   * Handle incoming mesh messages
   */
  private async handleMessageReceived(message: BridgefyMessage): Promise<void> {
    const parsed = JSON.parse(message.content) as BridgefySOSMessage | BridgefyAckMessage;

    switch (parsed.type) {
      case 'sos':
        await this.handleIncomingSOS(parsed, message.senderId);
        break;
      case 'sos_ack':
        await this.handleSOSAck(parsed);
        break;
      case 'status_update':
        await this.handleStatusUpdate(parsed as BridgefyStatusUpdate);
        break;
    }
  }

  /**
   * Relay SOS to backend if we have internet
   */
  private async handleIncomingSOS(
    sos: BridgefySOSMessage,
    receivedFrom: string
  ): Promise<void> {
    // Check if already processed (deduplication)
    if (await this.isMessageProcessed(sos.messageId)) {
      return;
    }

    // Mark as processed
    await this.markMessageProcessed(sos.messageId);

    // If we have internet, relay to backend
    if (navigator.onLine) {
      try {
        const response = await fetch('/api/v1/sos/mesh-relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...sos,
            relayedBy: this.userId,
            relayedAt: Date.now(),
          }),
        });

        if (response.ok) {
          // Send acknowledgment back through mesh
          await this.sendAcknowledgment(sos.messageId, sos.senderId);
        }
      } catch (error) {
        console.error('Failed to relay SOS to backend:', error);
      }
    }

    // If TTL remaining, relay to other devices
    if (sos.ttl > 0) {
      const relayMessage = {
        ...sos,
        ttl: sos.ttl - 1,
        hops: sos.hops + 1,
        routedVia: [...sos.routedVia, this.userId],
      };

      await this.bridgefy.send(
        JSON.stringify(relayMessage),
        'broadcast'
      );
    }
  }

  /**
   * Send acknowledgment through mesh
   */
  private async sendAcknowledgment(
    originalMessageId: string,
    targetUserId: string
  ): Promise<void> {
    const ack: BridgefyAckMessage = {
      type: 'sos_ack',
      originalMessageId,
      acknowledgedBy: 'backend',
      timestamp: Date.now(),
    };

    // Try direct send to original sender
    await this.bridgefy.send(
      JSON.stringify(ack),
      targetUserId
    );

    // Also broadcast in case direct path unavailable
    await this.bridgefy.send(
      JSON.stringify(ack),
      'broadcast'
    );
  }
}
```

#### D. Backend Mesh Relay Endpoint

```python
# backend/app/api/routes/mesh.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/mesh", tags=["Mesh Relay"])

class MeshSOSPayload(BaseModel):
    type: str = "sos"
    version: int
    messageId: str
    senderId: str
    payload: dict
    ttl: int
    hops: int
    routedVia: List[str]
    relayedBy: str
    relayedAt: int

@router.post("/relay")
async def receive_mesh_sos(data: MeshSOSPayload, db: Session = Depends(get_db)):
    """
    Receive SOS relayed from Bridgefy mesh network
    """
    # Deduplication check
    existing = db.query(SosRequest).filter(
        SosRequest.external_id == data.messageId
    ).first()

    if existing:
        return {"status": "duplicate", "sos_id": str(existing.id)}

    # Find patient by sender ID
    patient = db.query(Patient).filter(
        Patient.id == data.senderId
    ).first()

    if not patient:
        # Create anonymous SOS
        patient_id = None
    else:
        patient_id = patient.id

    # Create SOS request
    sos = SosRequest(
        id=uuid.uuid4(),
        external_id=data.messageId,
        patient_id=patient_id,
        latitude=data.payload["lat"],
        longitude=data.payload["lng"],
        severity=data.payload["severity"],
        patient_status=STATUS_MAP[data.payload["status"]],
        details=data.payload.get("details"),
        source="MESH",  # New source type
        mesh_hops=data.hops,
        mesh_relay_path=data.routedVia,
        mesh_relayed_by=data.relayedBy,
        created_at=datetime.fromtimestamp(data.payload["timestamp"] / 1000),
    )

    db.add(sos)
    db.commit()

    # Trigger triage pipeline
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

    # Broadcast via WebSocket
    await broadcast_sos({
        "id": str(sos.id),
        "source": "MESH",
        "hops": data.hops,
        # ... other fields
    })

    return {
        "status": "received",
        "sos_id": str(sos.id),
        "mesh_hops": data.hops,
    }
```

---

## Unified Fallback Manager

### Connection Manager Service

```typescript
// services/connectionManager.ts

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
    signalStrength: number; // 0-4
    canSendSMS: boolean;
  };
  bluetooth: {
    available: boolean;
    meshConnected: boolean;
    nearbyDevices: number;
  };
}

export class ConnectionManager {
  private static instance: ConnectionManager;
  private state: ConnectionState;
  private listeners: Set<(state: ConnectionState) => void> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  private constructor() {
    this.state = this.getInitialState();
    this.startMonitoring();
  }

  /**
   * Get current best available layer
   */
  getBestLayer(): ConnectionLayer {
    if (this.state.internet.available && this.state.internet.quality !== 'none') {
      return 'internet';
    }
    if (this.state.cellular.available && this.state.cellular.canSendSMS) {
      return 'sms';
    }
    if (this.state.bluetooth.available && this.state.bluetooth.meshConnected) {
      return 'bluetooth';
    }
    return 'none';
  }

  /**
   * Start continuous monitoring
   */
  private startMonitoring(): void {
    // Monitor online/offline events
    window.addEventListener('online', () => this.checkInternetConnection());
    window.addEventListener('offline', () => this.updateInternetState(false));

    // Periodic health checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10000); // Every 10 seconds

    // Initial check
    this.performHealthCheck();
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    await Promise.all([
      this.checkInternetConnection(),
      this.checkCellularStatus(),
      this.checkBluetoothStatus(),
    ]);

    // Update current layer
    this.state.currentLayer = this.getBestLayer();

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Check internet with actual request
   */
  private async checkInternetConnection(): Promise<void> {
    if (!navigator.onLine) {
      this.updateInternetState(false);
      return;
    }

    try {
      const start = Date.now();
      const response = await fetch('/api/v1/health', {
        method: 'HEAD',
        cache: 'no-store',
      });
      const rtt = Date.now() - start;

      this.state.internet = {
        available: response.ok,
        quality: rtt < 1000 ? 'good' : rtt < 5000 ? 'poor' : 'none',
        lastCheck: Date.now(),
      };
    } catch {
      this.updateInternetState(false);
    }
  }

  /**
   * Check cellular/SMS capability
   */
  private async checkCellularStatus(): Promise<void> {
    // Use Network Information API if available
    const connection = (navigator as any).connection;

    if (connection) {
      const isCellular = ['cellular', '2g', '3g', '4g'].includes(connection.type);
      this.state.cellular = {
        available: isCellular || connection.type !== 'none',
        signalStrength: this.estimateSignalStrength(connection.effectiveType),
        canSendSMS: true, // Assume SMS always available if device has telephony
      };
    } else {
      // Fallback: assume SMS is available on mobile devices
      this.state.cellular = {
        available: /Mobi|Android/i.test(navigator.userAgent),
        signalStrength: 2,
        canSendSMS: /Mobi|Android/i.test(navigator.userAgent),
      };
    }
  }

  /**
   * Check Bluetooth mesh status
   */
  private async checkBluetoothStatus(): Promise<void> {
    const bridgefy = BridgefyService.getInstance();

    this.state.bluetooth = {
      available: await this.isBluetoothAvailable(),
      meshConnected: bridgefy.isConnected(),
      nearbyDevices: bridgefy.getNearbyDeviceCount(),
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: ConnectionState) => void): () => void {
    this.listeners.add(callback);
    callback(this.state); // Immediate callback with current state
    return () => this.listeners.delete(callback);
  }
}
```

### SOS Dispatcher Service

```typescript
// services/sosDispatcher.ts

export interface SOSDispatchResult {
  success: boolean;
  layer: ConnectionLayer;
  messageId: string;
  fallbacksAttempted: ConnectionLayer[];
  error?: string;
}

export class SOSDispatcher {
  private connectionManager = ConnectionManager.getInstance();
  private bridgefyService = BridgefyService.getInstance();
  private smsService = new AutoSMSService();

  /**
   * Dispatch SOS through best available channel with automatic fallback
   */
  async dispatchSOS(sosData: SOSPayload): Promise<SOSDispatchResult> {
    const fallbacksAttempted: ConnectionLayer[] = [];
    const messageId = crypto.randomUUID();

    // Determine fallback order based on current conditions
    const fallbackOrder = this.getFallbackOrder();

    for (const layer of fallbackOrder) {
      fallbacksAttempted.push(layer);

      try {
        const result = await this.sendViaLayer(layer, sosData, messageId);

        if (result.success) {
          // Store successful delivery for sync
          await this.storeDeliveryRecord(messageId, layer, sosData);

          return {
            success: true,
            layer,
            messageId,
            fallbacksAttempted,
          };
        }
      } catch (error) {
        console.warn(`SOS dispatch via ${layer} failed:`, error);
        // Continue to next fallback
      }
    }

    // All layers failed - store for later retry
    await this.storeForRetry(messageId, sosData);

    return {
      success: false,
      layer: 'none',
      messageId,
      fallbacksAttempted,
      error: 'All communication channels unavailable',
    };
  }

  /**
   * Get fallback order based on current connection state
   */
  private getFallbackOrder(): ConnectionLayer[] {
    const state = this.connectionManager.getState();
    const order: ConnectionLayer[] = [];

    // Internet first if available and good quality
    if (state.internet.available && state.internet.quality === 'good') {
      order.push('internet');
    }

    // SMS if cellular available
    if (state.cellular.canSendSMS) {
      order.push('sms');
    }

    // Bluetooth mesh if connected
    if (state.bluetooth.meshConnected && state.bluetooth.nearbyDevices > 0) {
      order.push('bluetooth');
    }

    // Internet as last resort even if poor quality
    if (state.internet.available && !order.includes('internet')) {
      order.push('internet');
    }

    return order;
  }

  /**
   * Send SOS via specific layer
   */
  private async sendViaLayer(
    layer: ConnectionLayer,
    sosData: SOSPayload,
    messageId: string
  ): Promise<{ success: boolean }> {
    switch (layer) {
      case 'internet':
        return this.sendViaInternet(sosData, messageId);
      case 'sms':
        return this.sendViaSMS(sosData, messageId);
      case 'bluetooth':
        return this.sendViaBluetooth(sosData, messageId);
      default:
        return { success: false };
    }
  }

  /**
   * Send via Internet API
   */
  private async sendViaInternet(
    sosData: SOSPayload,
    messageId: string
  ): Promise<{ success: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch('/api/v1/sos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Message-ID': messageId,
        },
        body: JSON.stringify(sosData),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return { success: response.ok };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Send via SMS
   */
  private async sendViaSMS(
    sosData: SOSPayload,
    messageId: string
  ): Promise<{ success: boolean }> {
    const compactPayload = this.createCompactPayload(sosData, messageId);
    return {
      success: await AutoSMSService.sendAutomaticSOS(compactPayload),
    };
  }

  /**
   * Send via Bluetooth mesh
   */
  private async sendViaBluetooth(
    sosData: SOSPayload,
    messageId: string
  ): Promise<{ success: boolean }> {
    try {
      await this.bridgefyService.sendSOS({
        ...sosData,
        messageId,
      });
      return { success: true };
    } catch {
      return { success: false };
    }
  }
}
```

---

## Database Schema Updates

### New Fields for SOS Request

```python
# backend/app/models/sos_request.py - additions

class SOSSource(str, enum.Enum):
    API = "API"
    SMS = "SMS"
    MESH = "MESH"
    OFFLINE_SYNC = "OFFLINE_SYNC"

class SosRequest(Base):
    # ... existing fields ...

    # Source tracking
    source = Column(Enum(SOSSource), default=SOSSource.API)
    external_id = Column(String(36), index=True)  # Client-generated UUID for dedup

    # SMS specific
    sms_from_number = Column(String(20))
    sms_received_at = Column(DateTime)

    # Mesh specific
    mesh_hops = Column(Integer, default=0)
    mesh_relay_path = Column(ARRAY(String))  # Device IDs
    mesh_relayed_by = Column(UUID)  # User who relayed to backend
    mesh_received_at = Column(DateTime)

    # Offline sync
    client_created_at = Column(DateTime)  # When client created it
    synced_at = Column(DateTime)  # When synced to backend

    # Delivery tracking
    delivery_layer = Column(String(20))  # internet, sms, mesh
    fallbacks_attempted = Column(ARRAY(String))
```

### Migration

```python
# migrations/versions/xxx_add_multi_channel_sos.py

def upgrade():
    # Add source enum
    op.execute("ALTER TYPE sossource ADD VALUE IF NOT EXISTS 'MESH'")
    op.execute("ALTER TYPE sossource ADD VALUE IF NOT EXISTS 'OFFLINE_SYNC'")

    # Add new columns
    op.add_column('sos_requests', Column('external_id', String(36), index=True))
    op.add_column('sos_requests', Column('sms_from_number', String(20)))
    op.add_column('sos_requests', Column('sms_received_at', DateTime))
    op.add_column('sos_requests', Column('mesh_hops', Integer, default=0))
    op.add_column('sos_requests', Column('mesh_relay_path', ARRAY(String)))
    op.add_column('sos_requests', Column('mesh_relayed_by', UUID))
    op.add_column('sos_requests', Column('mesh_received_at', DateTime))
    op.add_column('sos_requests', Column('client_created_at', DateTime))
    op.add_column('sos_requests', Column('synced_at', DateTime))
    op.add_column('sos_requests', Column('delivery_layer', String(20)))
    op.add_column('sos_requests', Column('fallbacks_attempted', ARRAY(String)))
```

---

## Cost Analysis

### SMS Gateway (Twilio)

| Item | Cost (Jordan) | Volume | Monthly |
|------|---------------|--------|---------|
| Inbound SMS | $0.0075/msg | 1,000 | $7.50 |
| Outbound SMS | $0.0725/msg | 1,000 | $72.50 |
| Phone Number | $1.15/month | 1 | $1.15 |
| **Total** | | | **~$81/month** |

*Note: Local Jordan providers (Orange, Zain, Umniah) may offer better rates.*

### Bridgefy SDK

| Plan | Devices | Cost | Features |
|------|---------|------|----------|
| Starter | 1,000 | Free | Basic mesh |
| Pro | 10,000 | $500/month | Analytics, priority support |
| Enterprise | Unlimited | Custom | SLA, dedicated support |

**Recommendation**: Start with Starter (free), upgrade to Pro as user base grows.

### Native App Development

| Option | Cost | Timeline | Maintenance |
|--------|------|----------|-------------|
| React Native Wrapper | $5-10K | 4-6 weeks | Low |
| Capacitor + Bridgefy Plugin | $3-5K | 2-4 weeks | Low |
| Full Native (iOS + Android) | $30-50K | 3-6 months | High |

**Recommendation**: Capacitor with custom Bridgefy plugin.

---

## Security Considerations

### SMS Security

```typescript
// Enhanced SMS encryption
interface SecureSOSPayload {
  // AES-256-GCM encrypted
  enc: string;    // Encrypted payload
  iv: string;     // Initialization vector
  tag: string;    // Authentication tag

  // Signature for integrity
  sig: string;    // HMAC-SHA256 signature

  // Key derivation
  kdf: 'pbkdf2' | 'argon2';
  salt: string;
}
```

### Bridgefy Security

- **E2E Encryption**: Built into Bridgefy SDK
- **Device Verification**: Only verified TMT devices can relay
- **Anti-Replay**: Message ID + timestamp validation
- **Rate Limiting**: Max messages per device per hour

### Privacy Concerns

| Concern | Mitigation |
|---------|------------|
| Location tracking via mesh | Ephemeral device IDs, no persistent tracking |
| SMS interception | AES-256 encryption, no plaintext location |
| Relay node data access | Zero-knowledge relay (encrypted payloads) |

---

## Implementation Roadmap

### Phase 1: SMS Gateway (2-3 weeks)
- [ ] Set up Twilio account and phone number
- [ ] Implement SMS webhook endpoint
- [ ] Parse and validate encrypted SMS
- [ ] Integrate with existing triage pipeline
- [ ] Test with real SMS

### Phase 2: Enhanced Internet Fallback (1-2 weeks)
- [ ] Implement ConnectionManager service
- [ ] Add quality-based fallback logic
- [ ] Improve offline queue with IndexedDB
- [ ] Add automatic retry with backoff

### Phase 3: Native App Shell (2-3 weeks)
- [ ] Set up Capacitor project
- [ ] Port web app to Capacitor
- [ ] Add SMS plugin for automatic send
- [ ] Test on iOS and Android

### Phase 4: Bridgefy Integration (4-6 weeks)
- [ ] Obtain Bridgefy SDK license
- [ ] Create native plugin for Capacitor
- [ ] Implement mesh SOS messages
- [ ] Build relay logic with deduplication
- [ ] Test mesh network scenarios

### Phase 5: Unified Dispatcher (2 weeks)
- [ ] Build SOSDispatcher service
- [ ] Implement automatic fallback chain
- [ ] Add delivery tracking and analytics
- [ ] Integration testing across all layers

---

## Testing Strategy

### Unit Tests
- Connection state detection
- Payload encryption/decryption
- Fallback order calculation
- Deduplication logic

### Integration Tests
- SMS webhook → SOS creation
- Mesh relay → Backend ingestion
- Offline sync → Backend merge

### End-to-End Tests
- Full fallback chain simulation
- Real device mesh testing
- Cross-platform SMS testing

### Stress Tests
- 1000 concurrent mesh messages
- SMS gateway capacity
- Backend deduplication at scale

---

## Monitoring & Analytics

### Metrics to Track

```typescript
interface SOSDeliveryMetrics {
  // Success rates by layer
  internetSuccessRate: number;
  smsSuccessRate: number;
  meshSuccessRate: number;

  // Latency
  internetAvgLatency: number;  // ms
  smsAvgLatency: number;       // seconds
  meshAvgLatency: number;      // seconds
  meshAvgHops: number;

  // Fallback usage
  fallbackTriggerRate: number;
  layerDistribution: {
    internet: number;
    sms: number;
    mesh: number;
  };

  // Errors
  deliveryFailureRate: number;
  duplicateRate: number;
}
```

### Dashboard Additions

- Real-time connection layer distribution
- Mesh network health visualization
- SMS gateway status
- Fallback trigger alerts

---

## Conclusion

This multi-fallback SOS system provides resilience through three complementary communication layers:

1. **Internet**: Fast, full-featured, requires connectivity
2. **SMS**: Reliable, works with minimal cellular, character-limited
3. **Bluetooth Mesh**: Works offline, crowd-dependent, scalable

The recommended implementation path prioritizes SMS gateway integration (immediate value, low cost) followed by Bridgefy mesh (maximum resilience, higher effort).

**Key Success Factors**:
- Unified dispatcher with seamless fallback
- Strong encryption across all layers
- Deduplication to prevent duplicate alerts
- User feedback on delivery status
- Responder app mesh connectivity for bidirectional communication
