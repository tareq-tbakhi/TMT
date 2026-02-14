/**
 * AI Conversation Flow Configuration
 * Defines the questions and options for the AI SOS triage
 */

import type { ConversationQuestion } from "../types/sosTypes";

export const AI_CONVERSATION_FLOW: ConversationQuestion[] = [
  {
    id: "emergency_type",
    question: "What is your emergency case?",
    options: [
      { id: "medical", label: "Medical" },
      { id: "danger", label: "Danger" },
      { id: "trapped", label: "Trapped" },
      { id: "evacuate", label: "Evacuate" },
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
export const URGENCY_KEYWORDS = [
  "help",
  "now",
  "send",
  "hurry",
  "dying",
  "blood",
  "emergency",
  "quick",
  "fast",
  "urgent",
];

// AI response templates
export const AI_RESPONSES = {
  greeting: "I'm here to help. Let me collect some information quickly.",
  understood: "I understand.",
  gotIt: "Got it.",
  thankYou: "Thank you.",
  sendingNow: "Sending your SOS now...",
  areYouThere: "Are you there? Tap anywhere if you can't speak.",
  autoSending: "Sending automatically for your safety...",
  lowBattery: "Low battery detected. Sending quickly.",
};
