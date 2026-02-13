/**
 * Conversation area with scrollable message list
 * Auto-scrolls to bottom when new messages arrive
 */

import { useRef, useEffect } from "react";
import type { ConversationMessage } from "../../types/sosTypes";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface ConversationAreaProps {
  messages: ConversationMessage[];
  isTyping: boolean;
}

export function ConversationArea({ messages, isTyping }: ConversationAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change or typing state changes
  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);

    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
      style={{
        minHeight: "200px",
        maxHeight: "50vh",
        scrollbarWidth: "thin",
        scrollbarColor: "#d1d5db transparent"
      }}
    >
      {messages.length === 0 && !isTyping && (
        <div className="text-center text-gray-400 text-sm py-8">
          AI Assistant is ready to help...
        </div>
      )}

      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {isTyping && <TypingIndicator />}

      {/* Scroll anchor - always at bottom */}
      <div ref={bottomRef} />
    </div>
  );
}
