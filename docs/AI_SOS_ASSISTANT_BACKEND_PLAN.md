# AI-Powered SOS Assistant - Backend Implementation Plan

> **Note:** This document covers FUTURE backend implementation (Phase 1+).
> For the current frontend demo plan, see [AI_SOS_ASSISTANT_PLAN.md](./AI_SOS_ASSISTANT_PLAN.md).

---

## Overview

Backend integration for the AI SOS Assistant system, enabling real AI-powered triage, conversation storage, and intelligent SOS routing.

---

## Backend Configuration

```python
# File: backend/app/config/sos_config.py

SOS_CONFIG = {
    # Priority levels for different scenarios
    "UNRESPONSIVE_PRIORITY": "critical",
    "PARTIAL_RESPONSE_PRIORITY": "high",
    "NORMAL_PRIORITY": "medium",

    # Auto-notification delays (seconds)
    "EMERGENCY_CONTACT_NOTIFY_DELAY": 60,    # Wait before notifying emergency contacts
    "HOSPITAL_NOTIFY_DELAY": 0,               # Immediate hospital notification

    # Trust score adjustments
    "FALSE_ALARM_PENALTY": 0.1,
    "COMPLETED_SOS_BONUS": 0.05,
}
```

---

## Phase 1: Backend Integration

### API Endpoints

#### 1. AI Triage Endpoint

```
POST /api/v1/sos/ai-triage
```

**Request:**
```json
{
  "patient_id": "uuid",
  "conversation_history": [
    {"role": "ai", "message": "What type of emergency?"},
    {"role": "user", "message": "Medical", "option_id": "medical"}
  ],
  "context": {
    "latitude": 31.5100,
    "longitude": 34.4400,
    "battery_level": 0.45,
    "is_offline": false
  }
}
```

**Response:**
```json
{
  "next_question": {
    "id": "injured",
    "text": "Are you or anyone injured?",
    "options": [
      {"id": "serious", "label": "Yes, serious"},
      {"id": "minor", "label": "Yes, minor"},
      {"id": "none", "label": "No injuries"}
    ],
    "required": true,
    "allow_text": true
  },
  "should_auto_send": false,
  "estimated_severity": "high"
}
```

#### 2. Enhanced SOS Submission

```
POST /api/v1/sos/submit-with-triage
```

**Request:**
```json
{
  "patient_id": "uuid",
  "latitude": 31.5100,
  "longitude": 34.4400,
  "triage_data": {
    "emergency_type": "medical",
    "injury_status": "serious",
    "people_count": 1,
    "can_move": false,
    "additional_details": "Fell from stairs, leg injury"
  },
  "conversation_transcript": [...],
  "flags": {
    "unresponsive": false,
    "partial_response": false,
    "urgent_skip": false,
    "low_battery": false
  },
  "metadata": {
    "conversation_duration_seconds": 45,
    "questions_answered": 4,
    "questions_skipped": 1
  }
}
```

---

## Database Schema Changes

### New Table: `sos_conversations`

```sql
CREATE TABLE sos_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sos_request_id UUID REFERENCES sos_requests(id),
    patient_id UUID REFERENCES patients(id),

    -- Conversation data
    transcript JSONB NOT NULL DEFAULT '[]',
    triage_data JSONB NOT NULL DEFAULT '{}',

    -- Flags
    was_unresponsive BOOLEAN DEFAULT FALSE,
    was_partial_response BOOLEAN DEFAULT FALSE,
    was_urgent_skip BOOLEAN DEFAULT FALSE,
    was_low_battery BOOLEAN DEFAULT FALSE,

    -- Metrics
    duration_seconds INTEGER,
    questions_asked INTEGER,
    questions_answered INTEGER,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Updates to `sos_requests` Table

```sql
ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS
    triage_severity VARCHAR DEFAULT 'unknown';
ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS
    triage_emergency_type VARCHAR;
ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS
    conversation_id UUID REFERENCES sos_conversations(id);
```

---

## Backend Handling for Edge Cases

### Unresponsive User

When an SOS is received with `unresponsive: true`:

```python
async def handle_unresponsive_sos(sos_request: SOSRequest):
    # 1. Set highest priority
    sos_request.priority = "critical"
    sos_request.triage_severity = "critical"

    # 2. Get patient medical data
    patient = await get_patient(sos_request.patient_id)

    # 3. Auto-notify nearest hospital immediately
    nearest_hospital = await find_nearest_operational_hospital(
        sos_request.latitude,
        sos_request.longitude
    )
    await notify_hospital(nearest_hospital, sos_request, urgent=True)

    # 4. Auto-notify emergency contacts
    for contact in patient.emergency_contacts:
        await send_emergency_notification(
            contact,
            sos_request,
            message="Patient is unresponsive after SOS"
        )

    # 5. Flag for dispatch team
    await create_dispatch_alert(
        sos_request,
        note="UNRESPONSIVE - Patient may be unconscious or in danger"
    )
```

### Partial Response

```python
async def handle_partial_response_sos(sos_request: SOSRequest, triage_data: dict):
    # Calculate severity from available data
    severity = calculate_severity_from_partial(triage_data)

    sos_request.priority = "high"
    sos_request.triage_severity = severity

    # Include what we know vs what's missing
    sos_request.notes = f"""
    PARTIAL TRIAGE DATA:
    - Answered: {', '.join(triage_data.get('answered', []))}
    - Missing: {', '.join(triage_data.get('unanswered', []))}
    """
```

---

## Phase 2: LLM Integration

### LLM Service

```python
# File: backend/app/services/ai_triage.py

from openai import AsyncOpenAI  # or GLM-5 client

class AITriageService:
    def __init__(self):
        self.client = AsyncOpenAI()
        self.system_prompt = """
        You are an emergency triage assistant. Your job is to quickly and calmly
        gather critical information from someone in an emergency situation.

        Guidelines:
        - Be calm and reassuring
        - Ask one question at a time
        - Keep questions short and simple
        - Prioritize: emergency type, danger level, injuries, location
        - If user seems panicked, simplify even more
        - If user says "help now" or similar, stop asking and recommend sending
        """

    async def get_next_question(
        self,
        conversation_history: list,
        patient_context: dict
    ) -> dict:
        response = await self.client.chat.completions.create(
            model="gpt-4-turbo",  # or GLM-5
            messages=[
                {"role": "system", "content": self.system_prompt},
                *conversation_history
            ],
            functions=[{
                "name": "ask_question",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "should_send_now": {"type": "boolean"},
                        "detected_urgency": {"type": "string"}
                    }
                }
            }]
        )

        return parse_llm_response(response)

    async def interpret_response(
        self,
        user_input: str,
        expected_question: str
    ) -> dict:
        """Interpret free-text responses into structured data"""
        # LLM extracts structured info from natural language
        pass
```

---

## Phase 3: Advanced Features

### Voice Transcription Service

```python
# File: backend/app/services/voice_transcription.py

import whisper

class VoiceTranscriptionService:
    def __init__(self):
        self.model = whisper.load_model("base")

    async def transcribe(self, audio_data: bytes) -> str:
        # Transcribe audio to text
        result = self.model.transcribe(audio_data)
        return result["text"]

    async def transcribe_with_language_detect(
        self,
        audio_data: bytes
    ) -> dict:
        result = self.model.transcribe(audio_data)
        return {
            "text": result["text"],
            "language": result["language"],
            "confidence": result.get("confidence", 0.0)
        }
```

### Panic Detection Service

```python
# File: backend/app/services/panic_detection.py

class PanicDetectionService:
    PANIC_INDICATORS = {
        "repeated_words": r"(\b\w+\b)(\s+\1){2,}",  # help help help
        "excessive_caps": lambda t: sum(1 for c in t if c.isupper()) / len(t) > 0.7,
        "excessive_punctuation": lambda t: t.count("!") > 3,
        "urgency_keywords": ["help", "please", "hurry", "dying", "blood"],
    }

    def detect_panic(self, text: str) -> dict:
        panic_score = 0
        indicators = []

        # Check each indicator
        if re.search(self.PANIC_INDICATORS["repeated_words"], text):
            panic_score += 0.3
            indicators.append("repeated_words")

        if self.PANIC_INDICATORS["excessive_caps"](text):
            panic_score += 0.2
            indicators.append("all_caps")

        # ... more checks

        return {
            "is_panicking": panic_score > 0.5,
            "panic_score": panic_score,
            "indicators": indicators,
            "recommendation": "simplified_mode" if panic_score > 0.5 else "normal"
        }
```

---

## WebSocket Events for Real-time Updates

```python
# File: backend/app/api/websocket/sos_events.py

@sio.on("sos_triage_update")
async def handle_triage_update(sid, data):
    """Handle real-time triage updates from frontend"""
    patient_id = data["patient_id"]
    update_type = data["type"]

    if update_type == "question_answered":
        # Update hospital dashboard in real-time
        await sio.emit(
            "sos_progress",
            {
                "patient_id": patient_id,
                "question": data["question"],
                "answer": data["answer"],
                "progress_percent": data["progress"]
            },
            room=f"hospital_{data['hospital_id']}"
        )

    elif update_type == "user_unresponsive":
        # Escalate alert
        await sio.emit(
            "sos_escalation",
            {
                "patient_id": patient_id,
                "reason": "unresponsive",
                "last_activity": data["last_activity"]
            },
            room=f"hospital_{data['hospital_id']}"
        )
```

---

## Success Metrics (Backend)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Triage API latency | < 200ms | P95 response time |
| LLM response time | < 2s | Average completion time |
| Conversation storage | 100% | All transcripts saved |
| Auto-escalation rate | > 95% | Unresponsive cases escalated |
| Hospital notification | < 5s | Time to notify nearest hospital |

---

## Implementation Timeline

| Phase | Features | Estimated Effort |
|-------|----------|------------------|
| Phase 1 | Backend API, Database, Basic routing | 2-3 weeks |
| Phase 2 | LLM integration, Smart responses | 2-3 weeks |
| Phase 3 | Voice, Panic detection, Multi-language | 3-4 weeks |

---

*Document created: 2024*
*Status: Future planning - not needed for demo*
