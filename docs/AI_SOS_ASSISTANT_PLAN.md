# AI-Powered SOS Assistant - Frontend Demo Plan

> **Scope:** Frontend-only implementation for demo/presentation.
> For backend implementation (Phase 1+), see [AI_SOS_ASSISTANT_BACKEND_PLAN.md](./AI_SOS_ASSISTANT_BACKEND_PLAN.md).

---

## Overview

When a user presses the SOS button, an AI assistant engages with the user to gather critical information. This creates a more intelligent triage system that collects structured, actionable data for responders.

---

## Architecture & Best Practices

This implementation follows the existing TMT codebase patterns:

### Design Principles
- **Single Responsibility**: Each component handles one specific concern
- **Composition over Inheritance**: Small, composable components
- **Offline-First**: IndexedDB for local storage, sync when online
- **Type Safety**: Strict TypeScript interfaces for all data structures
- **State Management**: Zustand for global state (following existing `authStore`, `alertStore` patterns)

### Color Scheme (Consistent with TMT Theme)
| Context | Tailwind Classes | Usage |
|---------|------------------|-------|
| Critical/Urgent | `bg-red-600`, `text-red-700`, `border-red-200` | Urgent Call button, errors |
| Warning | `bg-amber-500`, `text-amber-700`, `bg-amber-50` | Timeout warnings, offline mode |
| Success | `bg-green-100`, `text-green-700`, `border-green-200` | GPS detected, message sent |
| Info | `bg-blue-100`, `text-blue-600`, `border-blue-200` | AI messages, processing |
| Neutral | `bg-gray-50`, `text-gray-700`, `border-gray-100` | Cards, backgrounds |

### Component Patterns
```typescript
// Card pattern (existing)
className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"

// Button pattern (existing)
className="px-4 py-2.5 rounded-lg font-medium transition-colors"

// Critical button (SOS/Urgent)
className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl"
```

---

## Configuration Constants

```typescript
// File: frontend/src/config/sosConfig.ts

export const SOS_CONFIG = {
  // ─── Initial Countdown ───────────────────────────────
  CANCEL_COUNTDOWN_SECONDS: 5,        // Time user can cancel before AI starts

  // ─── AI Conversation Timeouts ────────────────────────
  FIRST_REMINDER_SECONDS: 15,         // Time before showing "Are you there?"
  AUTO_SEND_SECONDS: 30,              // Time before auto-sending (unresponsive)
  PARTIAL_RESPONSE_TIMEOUT: 20,       // Time after last response before sending partial

  // ─── App Background/Lock ─────────────────────────────
  BACKGROUND_AUTO_SEND_SECONDS: 45,   // Time before auto-send when app backgrounded

  // ─── Low Battery Mode ────────────────────────────────
  LOW_BATTERY_THRESHOLD: 0.15,        // Battery level (15%) to trigger expedited mode
  LOW_BATTERY_MAX_QUESTIONS: 2,       // Max questions to ask in low battery mode

  // ─── Conversation Limits ─────────────────────────────
  MAX_CONVERSATION_SECONDS: 120,      // Hard limit - auto-send after 2 minutes
  MAX_QUESTIONS: 8,                   // Maximum questions before auto-send

  // ─── Duplicate SOS Detection ─────────────────────────
  DUPLICATE_SOS_WINDOW_MINUTES: 5,    // Time window to detect duplicate SOS
} as const;

export type SOSConfigKey = keyof typeof SOS_CONFIG;
```

---

## User Flow

```
[User presses SOS]
    → [5-second countdown with cancel option]
    → [AI ASSISTANT SCREEN - Voice active by default]
        ├── AI Voice Assistant (primary - starts automatically)
        ├── Text input option (tap to switch)
        ├── Camera option (attach image)
        └── Urgent Call button (always visible at bottom)
    → [Collect responses in local state]
    → [Send via existing SOS endpoint]
    → [Confirmation screen]
```

---

## AI Assistant Screen (After Countdown)

After the 5-second cancel countdown, the **AI Voice Assistant starts immediately**.

### Screen Layout

```
┌─────────────────────────────────────┐
│                                     │
│  ╔═══════════════════════════════╗  │
│  ║  REAL-TIME AI CONVERSATION    ║  │
│  ║  (Agent collecting data)      ║  │
│  ╠═══════════════════════════════╣  │
│  ║                               ║  │
│  ║  🤖 AI: What type of          ║  │
│  ║      emergency is this?       ║  │
│  ║                               ║  │
│  ║  👤 You: Medical emergency    ║  │
│  ║                               ║  │
│  ║  🤖 AI: Are you injured?      ║  │
│  ║      How serious?             ║  │
│  ║                               ║  │
│  ║  👤 You: Yes, my leg...       ║  │
│  ║                               ║  │
│  ║  🤖 AI: I understand. Can     ║  │
│  ║      you move to safety?      ║  │
│  ║           ·                   ║  │
│  ║           ·  (typing...)      ║  │
│  ║           ·                   ║  │
│  ╚═══════════════════════════════╝  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  [Medical] [Danger] [Trapped]│   │  ← Quick-tap buttons
│  └─────────────────────────────┘   │
│                                     │
│  ╭─────────────────────────────╮   │
│  │  🎙️  ════════════════       │   │  ← Voice input
│  │      ▁▂▃▅▇▅▃▂▁  Listening...│   │     (always visible)
│  ╰─────────────────────────────╯   │
│                                     │
│     ┌──────┐        ┌──────┐       │
│     │  💬  │        │  📷  │       │   ← Text & Photo options
│     │ Text │        │ Photo│       │
│     └──────┘        └──────┘       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  📞  URGENT CALL             │   │  ← Always visible
│  │  Speak with an operator      │   │     Red button
│  └─────────────────────────────┘   │
│                                     │
│         [Cancel SOS]               │
│                                     │
└─────────────────────────────────────┘
```

### Screen Sections

| Section | Description |
|---------|-------------|
| **Top: Real-time Conversation** | Live chat between AI agent and user. Agent asks questions, user responds. Messages appear in real-time. |
| **Quick-tap Buttons** | Pre-defined response options for fast tapping (Medical, Danger, Trapped, etc.) |
| **Voice Input** | Always visible with waveform animation - speak to respond |
| **Text & Photo** | 💬 Switch to text mode, 📷 Attach a photo |
| **Urgent Call** | Red button always visible - tap to call operator immediately |
| **Cancel** | Cancel SOS at any time |

### Real-time AI Conversation (Top Section)

The **main feature** - a live conversation between the AI agent and user:

- **AI Agent actively responds** to user input in real-time
- **Collects information** through natural dialogue
- Shows both AI messages and user responses
- **Typing indicator** when AI is processing
- Scrollable conversation history
- AI adapts questions based on previous answers

**Example Conversation:**
```
🤖 AI: What type of emergency is this?
👤 You: Medical emergency
🤖 AI: Are you injured? How serious is it?
👤 You: Yes, I fell and hurt my leg badly
🤖 AI: I understand. Can you still move?
👤 You: No, I can't walk
🤖 AI: Stay where you are. How many people are with you?
...
```

### Input Methods

#### 1. Voice Input (Always Visible - Primary)
- **Voice area always visible** with waveform animation
- **Starts listening automatically** after countdown
- User speaks, transcription appears in conversation
- AI responds in real-time to voice input
- Tap microphone to pause/resume listening

#### 2. Quick-tap Buttons
- Pre-defined response options (Medical, Danger, Trapped, etc.)
- Fast one-tap responses
- Changes based on current AI question

#### 3. Text Input (💬)
- Tap 💬 icon to open text keyboard
- Type messages to AI
- Quick-tap buttons still available
- Voice input pauses while typing

#### 4. Camera/Photo (📷)
- Tap 📷 icon to attach image
- Capture current situation (injuries, damage, location)
- Image appears in conversation
- Helpful for showing injuries or surroundings

#### 5. Urgent Call (Always Available)
- **Red button always visible at bottom**
- Tap anytime to call emergency operator
- Interrupts AI conversation immediately
- Shows calling screen (demo)

---

## AI Assistant Interface

### Layout (Conversation-First with Options)

- **Real-time AI conversation at top** (main focus)
- AI agent responds and collects data through dialogue
- Quick-tap response buttons for fast answers
- Voice input by default, text input via 💬 icon
- Camera input available via 📷 icon
- Urgent Call button always visible (red, at bottom)
- Progress indicator showing data collection status

### TypeScript Interfaces

```typescript
// File: frontend/src/types/sosTypes.ts

// ─── Emergency Types ───────────────────────────────────
export type EmergencyType = "medical" | "danger" | "trapped" | "evacuate";
export type InjuryStatus = "serious" | "minor" | "none";
export type PeopleCount = "just_me" | "2_3_people" | "more_than_3";
export type MobilityStatus = "can_move" | "trapped" | "injured";
export type InputMode = "voice" | "text";

// ─── Message Types ─────────────────────────────────────
export interface AIMessage {
  id: string;
  role: "ai";
  content: string;
  timestamp: Date;
  questionId?: string;
  options?: QuickOption[];
}

export interface UserMessage {
  id: string;
  role: "user";
  content: string;
  timestamp: Date;
  questionId?: string;
  selectedOption?: string;
  imageUrl?: string;
}

export type ConversationMessage = AIMessage | UserMessage;

// ─── Quick Response Options ────────────────────────────
export interface QuickOption {
  id: string;
  label: string;
  icon?: string;
}

// ─── Question Definition ───────────────────────────────
export interface ConversationQuestion {
  id: string;
  question: string;
  options: QuickOption[];
  required: boolean;
  allowText?: boolean;
  allowImage?: boolean;
}

// ─── Triage Data (Collected Info) ──────────────────────
export interface TriageData {
  emergencyType?: EmergencyType;
  injuryStatus?: InjuryStatus;
  peopleCount?: PeopleCount;
  canMove?: MobilityStatus;
  additionalDetails?: string;
  attachedImages?: string[];
}

// ─── AI Assistant State ────────────────────────────────
export type AIAssistantState =
  | "listening"        // Voice input active, waiting for user
  | "processing"       // Processing user input (typing indicator)
  | "asking"           // Displaying AI question
  | "timeout_warning"  // Showing "Are you there?" reminder
  | "auto_sending"     // Auto-send countdown active
  | "sending"          // Submitting SOS
  | "done";            // Conversation complete

// ─── Voice Input State ─────────────────────────────────
export interface VoiceState {
  isListening: boolean;
  transcript: string;
  confidence: number;
  error?: string;
}
```

### Conversation Flow (Hardcoded)

```typescript
// File: frontend/src/config/conversationFlow.ts

import type { ConversationQuestion } from "../types/sosTypes";

export const AI_CONVERSATION_FLOW: ConversationQuestion[] = [
  {
    id: "emergency_type",
    question: "What type of emergency is this?",
    options: [
      { id: "medical", label: "Medical", icon: "🏥" },
      { id: "danger", label: "Danger", icon: "⚠️" },
      { id: "trapped", label: "Trapped", icon: "🚧" },
      { id: "evacuate", label: "Evacuate", icon: "🏃" },
    ],
    required: true,
  },
  {
    id: "injured",
    question: "Are you or anyone injured?",
    options: [
      { id: "serious", label: "Yes, serious" },
      { id: "minor", label: "Yes, minor" },
      { id: "none", label: "No injuries" },
    ],
    required: true,
  },
  {
    id: "people_count",
    question: "How many people need help?",
    options: [
      { id: "just_me", label: "Just me" },
      { id: "2_3_people", label: "2-3 people" },
      { id: "more_than_3", label: "More than 3" },
    ],
    required: false,
  },
  {
    id: "can_move",
    question: "Can you move to safety?",
    options: [
      { id: "can_move", label: "Yes" },
      { id: "trapped", label: "No, trapped" },
      { id: "injured", label: "No, injured" },
    ],
    required: false,
  },
  {
    id: "details",
    question: "Any other details? (optional)",
    options: [],
    allowText: true,
    allowImage: true,
    required: false,
  },
];

// Urgency keywords that trigger immediate send
export const URGENCY_KEYWORDS = ["help", "now", "send", "hurry", "dying", "blood", "emergency"];
```

### Zustand Store (State Management)

```typescript
// File: frontend/src/store/aiAssistantStore.ts

import { create } from "zustand";
import type {
  AIAssistantState,
  ConversationMessage,
  TriageData,
  VoiceState,
  InputMode,
} from "../types/sosTypes";

interface AIAssistantStore {
  // ─── State ───────────────────────────────────────────
  state: AIAssistantState;
  messages: ConversationMessage[];
  currentQuestionIndex: number;
  triageData: TriageData;
  inputMode: InputMode;
  voiceState: VoiceState;

  // Timers
  secondsSinceLastResponse: number;
  totalConversationSeconds: number;
  isLowBattery: boolean;

  // ─── Actions ─────────────────────────────────────────
  setState: (state: AIAssistantState) => void;
  addMessage: (message: ConversationMessage) => void;
  setTriageData: (data: Partial<TriageData>) => void;
  setInputMode: (mode: InputMode) => void;
  setVoiceState: (state: Partial<VoiceState>) => void;
  nextQuestion: () => void;
  reset: () => void;

  // Timer actions
  incrementTimer: () => void;
  resetResponseTimer: () => void;
  setLowBattery: (isLow: boolean) => void;
}

const initialVoiceState: VoiceState = {
  isListening: false,
  transcript: "",
  confidence: 0,
};

export const useAIAssistantStore = create<AIAssistantStore>((set) => ({
  // Initial state
  state: "listening",
  messages: [],
  currentQuestionIndex: 0,
  triageData: {},
  inputMode: "voice",
  voiceState: initialVoiceState,
  secondsSinceLastResponse: 0,
  totalConversationSeconds: 0,
  isLowBattery: false,

  // Actions
  setState: (state) => set({ state }),

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  setTriageData: (data) =>
    set((s) => ({ triageData: { ...s.triageData, ...data } })),

  setInputMode: (mode) => set({ inputMode: mode }),

  setVoiceState: (state) =>
    set((s) => ({ voiceState: { ...s.voiceState, ...state } })),

  nextQuestion: () =>
    set((s) => ({ currentQuestionIndex: s.currentQuestionIndex + 1 })),

  reset: () =>
    set({
      state: "listening",
      messages: [],
      currentQuestionIndex: 0,
      triageData: {},
      inputMode: "voice",
      voiceState: initialVoiceState,
      secondsSinceLastResponse: 0,
      totalConversationSeconds: 0,
    }),

  incrementTimer: () =>
    set((s) => ({
      secondsSinceLastResponse: s.secondsSinceLastResponse + 1,
      totalConversationSeconds: s.totalConversationSeconds + 1,
    })),

  resetResponseTimer: () => set({ secondsSinceLastResponse: 0 }),

  setLowBattery: (isLow) => set({ isLowBattery: isLow }),
}));
```

---

## Information to Collect

### Priority 1 - Critical
1. **Emergency Type** - Medical / Danger / Trapped / Evacuate
2. **Injury Status** - Serious / Minor / None
3. **Location** - GPS auto-detected (already have this)

### Priority 2 - Important
4. **People Count** - Just me / 2-3 / More than 3
5. **Mobility** - Can move / Trapped / Injured

### Priority 3 - Optional
6. **Additional Details** - Free text input

---

## Edge Cases

### 1. No Response (CRITICAL)

User pressed SOS but is not responding.

**Strategy:**
```
[AI asks first question]
    → [No response for 15 seconds]
    → [Show: "Are you there? Tap anywhere if you can't type"]
    → [No response for 30 seconds total]
    → [AUTO-SEND with location + patient profile data]
```

**Visual:**
- Countdown timer: "Sending automatically in 15 seconds..."
- Large "TAP IF YOU'RE OK" button
- Pulsing screen animation

### 2. Partial Response Then Silence

User answered 1-2 questions then stopped.

**Strategy:**
- Wait 20 seconds after last response
- Send what we have
- Include which questions were answered

### 3. User Says "Help Now"

Detect urgency keywords: "help", "now", "send", "hurry"

**Strategy:**
- Immediately send with collected data
- Skip remaining questions

### 4. Low Battery

```javascript
navigator.getBattery().then(battery => {
  if (battery.level < 0.15) {
    // Ask only 2 questions max
  }
});
```

**Strategy:**
- Show: "Low battery - sending quickly"
- Ask only emergency type + injury status
- Auto-send after 2 questions

### 5. App Backgrounded

User locked phone or switched apps.

**Strategy:**
- Continue countdown
- Auto-send after 45 seconds

---

## Demo Flow

1. User presses SOS → 5-second cancel countdown
2. AI Assistant screen appears with **voice active by default**
3. AI asks first question (voice + text display)
4. User can:
   - **Speak** response (primary)
   - **Tap** quick-response buttons
   - **Type** via 💬 text mode
   - **Attach photo** via 📷 camera
   - **Call operator** via red Urgent Call button (anytime)
5. AI asks follow-up questions
6. If no response → timeout warning → auto-send
7. Collect all responses in local state
8. Send via existing SOS endpoint
9. Show confirmation with collected data summary

---

## Frontend Components

### Component Architecture

```
frontend/src/
├── config/
│   ├── sosConfig.ts              # Timing constants
│   └── conversationFlow.ts       # Question definitions
│
├── types/
│   └── sosTypes.ts               # TypeScript interfaces
│
├── store/
│   └── aiAssistantStore.ts       # Zustand state management
│
├── hooks/
│   ├── useVoiceInput.ts          # Web Speech API hook
│   ├── useConversationTimer.ts   # Timeout management
│   └── useBatteryStatus.ts       # Battery level detection
│
├── components/
│   └── sos/
│       ├── AIAssistantScreen.tsx # Main AI screen container
│       ├── ConversationArea.tsx  # Message list container
│       ├── MessageBubble.tsx     # AI/User message component
│       ├── TypingIndicator.tsx   # AI typing animation
│       ├── QuickResponses.tsx    # Quick-tap button grid
│       ├── VoiceInput.tsx        # Voice waveform & controls
│       ├── TextInput.tsx         # Text input field
│       ├── CameraCapture.tsx     # Photo attachment
│       ├── UrgentCallButton.tsx  # Red call button
│       └── TimeoutOverlay.tsx    # "Are you there?" overlay
│
└── pages/
    └── patient/
        └── SOS.tsx               # Main SOS page (updated)
```

### Component Tree

```
SOS.tsx
├── CountdownScreen (existing)
├── AIAssistantScreen (NEW - main screen after countdown)
│   │
│   ├── ConversationArea (TOP - main focus)
│   │   ├── MessageList (scrollable, flex-1)
│   │   │   ├── MessageBubble (role="ai")
│   │   │   │   └── className="bg-blue-50 rounded-2xl rounded-tl-sm p-4"
│   │   │   └── MessageBubble (role="user")
│   │   │       └── className="bg-gray-100 rounded-2xl rounded-tr-sm p-4 ml-auto"
│   │   └── TypingIndicator (when AI processing)
│   │       └── className="flex gap-1" (bouncing dots)
│   │
│   ├── QuickResponses (MIDDLE)
│   │   └── className="flex flex-wrap gap-2 p-4"
│   │   └── Button: className="px-4 py-2 bg-white border border-gray-200 rounded-full
│   │               text-sm font-medium hover:bg-gray-50 active:bg-gray-100"
│   │
│   ├── VoiceInput (always visible)
│   │   ├── className="bg-gray-50 rounded-2xl p-4 mx-4"
│   │   ├── VoiceWaveform (animated bars)
│   │   └── TranscriptionDisplay (live text)
│   │
│   ├── InputModeToggle
│   │   ├── TextModeButton (💬)
│   │   │   └── className="w-12 h-12 bg-white rounded-full border shadow-sm"
│   │   └── CameraButton (📷)
│   │       └── className="w-12 h-12 bg-white rounded-full border shadow-sm"
│   │
│   ├── UrgentCallButton (BOTTOM - always visible)
│   │   └── className="w-full bg-red-600 hover:bg-red-700 text-white
│   │                   font-bold py-4 rounded-xl flex items-center justify-center gap-2"
│   │
│   ├── CancelButton
│   │   └── className="w-full py-3 text-gray-500 font-medium"
│   │
│   └── TimeoutOverlay (overlay when no response)
│       └── className="fixed inset-0 bg-black/50 backdrop-blur-sm"
│       └── Contains pulsing "TAP IF YOU'RE OK" button
│
├── CallingScreen (NEW - demo only)
│   └── Mock calling UI with end call button
├── ConfirmationScreen (existing)
└── CancelledScreen (existing)
```

### Custom Hooks

```typescript
// ─── useVoiceInput.ts ──────────────────────────────────
// Wraps Web Speech API with error handling

import { useState, useCallback, useEffect, useRef } from "react";
import type { VoiceState } from "../types/sosTypes";

export function useVoiceInput() {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    transcript: "",
    confidence: 0,
  });
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window)) {
      setVoiceState((s) => ({ ...s, error: "Voice not supported" }));
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      setVoiceState({
        isListening: true,
        transcript: result[0].transcript,
        confidence: result[0].confidence,
      });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setVoiceState((s) => ({ ...s, error: event.error, isListening: false }));
    };

    recognition.start();
    recognitionRef.current = recognition;
    setVoiceState((s) => ({ ...s, isListening: true }));
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceState((s) => ({ ...s, isListening: false }));
  }, []);

  return { voiceState, startListening, stopListening };
}

// ─── useConversationTimer.ts ───────────────────────────
// Manages timeout and auto-send logic

export function useConversationTimer(
  onFirstReminder: () => void,
  onAutoSend: () => void
) {
  // Timer logic with SOS_CONFIG values
  // Calls onFirstReminder at 15s, onAutoSend at 30s
}

// ─── useBatteryStatus.ts ───────────────────────────────
// Detects low battery for expedited mode

export function useBatteryStatus() {
  const [isLowBattery, setIsLowBattery] = useState(false);

  useEffect(() => {
    navigator.getBattery?.().then((battery) => {
      setIsLowBattery(battery.level < 0.15);
      battery.addEventListener("levelchange", () => {
        setIsLowBattery(battery.level < 0.15);
      });
    });
  }, []);

  return isLowBattery;
}
```

---

## What We Build (Demo)

| Feature | Included |
|---------|----------|
| **Real-time AI conversation** | ✅ Yes |
| AI agent responds & collects data | ✅ Yes |
| Voice input (starts automatically) | ✅ Yes |
| Voice waveform animation | ✅ Yes |
| Text input mode (💬) | ✅ Yes |
| Camera/Photo option (📷) | ✅ Yes |
| Urgent Call button (red, always visible) | ✅ Yes (UI only) |
| Quick-tap response buttons | ✅ Yes |
| Timeout countdown | ✅ Yes |
| Configurable timings | ✅ Yes |
| Unresponsive auto-send | ✅ Yes |
| Hardcoded conversation flow | ✅ Yes |
| Send via existing endpoint | ✅ Yes |

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `frontend/src/config/sosConfig.ts` - timing constants
- [ ] Create `frontend/src/config/conversationFlow.ts` - question definitions
- [ ] Create `frontend/src/types/sosTypes.ts` - TypeScript interfaces
- [ ] Create `frontend/src/store/aiAssistantStore.ts` - Zustand store

### Phase 2: Core Components
- [ ] Create `frontend/src/components/sos/MessageBubble.tsx`
- [ ] Create `frontend/src/components/sos/ConversationArea.tsx`
- [ ] Create `frontend/src/components/sos/TypingIndicator.tsx`
- [ ] Create `frontend/src/components/sos/QuickResponses.tsx`

### Phase 3: Input Methods
- [ ] Create `frontend/src/hooks/useVoiceInput.ts` - Web Speech API
- [ ] Create `frontend/src/components/sos/VoiceInput.tsx` - waveform UI
- [ ] Create `frontend/src/components/sos/TextInput.tsx`
- [ ] Create `frontend/src/components/sos/CameraCapture.tsx`

### Phase 4: Main Screen & Actions
- [ ] Create `frontend/src/components/sos/UrgentCallButton.tsx`
- [ ] Create `frontend/src/components/sos/TimeoutOverlay.tsx`
- [ ] Create `frontend/src/components/sos/AIAssistantScreen.tsx` - main container
- [ ] Create `frontend/src/hooks/useConversationTimer.ts` - timeout logic

### Phase 5: Integration
- [ ] Update `frontend/src/pages/patient/SOS.tsx` - integrate AI screen
- [ ] Create `frontend/src/hooks/useBatteryStatus.ts` - low battery detection
- [ ] Connect to existing `createSOS` API endpoint
- [ ] Add IndexedDB offline support (follow existing pattern)

### Phase 6: Testing & Polish
- [ ] Test full conversation flow
- [ ] Test voice input on mobile devices
- [ ] Test timeout/auto-send scenarios
- [ ] Test offline SMS fallback
- [ ] Verify accessibility (screen readers, keyboard nav)

---

## Quality Checklist

### Code Quality
- [ ] All components use TypeScript strict mode
- [ ] No `any` types - proper interfaces defined
- [ ] Components follow single responsibility principle
- [ ] Reusable logic extracted to custom hooks
- [ ] Error boundaries for voice input failures

### Accessibility
- [ ] All buttons have `aria-label` attributes
- [ ] Voice waveform has `aria-live` for screen readers
- [ ] Focus management during conversation flow
- [ ] Color contrast meets WCAG AA standards

### Performance
- [ ] Voice recognition cleanup on unmount
- [ ] Timer cleanup on component unmount
- [ ] Memoized callbacks with `useCallback`
- [ ] Virtualized message list if > 20 messages

### Testing
- [ ] Unit tests for Zustand store actions
- [ ] Integration test for conversation flow
- [ ] E2E test for full SOS submission

---

*Document created: 2024*
*Last updated: 2024*
*Status: Ready for implementation*
