/**
 * Message bubble component for AI/User messages
 */

import type { ConversationMessage } from "../../types/sosTypes";
import { Badge } from "../ui";

interface MessageBubbleProps {
  message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAI = message.role === "ai";

  return (
    <div className={`mb-3 flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-xl ${
          isAI
            ? "rounded-ss-md border border-edge bg-surface-2 text-ink"
            : "rounded-se-md bg-accent-soft text-on-accent-soft"
        }`}
      >
        {/* Message content */}
        <p className="px-4 py-3 text-base leading-relaxed">
          {message.content}
        </p>

        {/* Image attachment (for user messages) */}
        {message.role === "user" && message.imageUrl && (
          <div className="px-4 pb-3">
            <img
              src={message.imageUrl}
              alt="Attached"
              className="max-h-32 rounded-md object-cover"
            />
          </div>
        )}

        {/* Selected option badge (for user messages) */}
        {message.role === "user" && message.selectedOption && (
          <div className="px-4 pb-3">
            <Badge tone="accent" solid size="sm">
              {message.selectedOption}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
