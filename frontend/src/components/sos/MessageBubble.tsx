/**
 * Message bubble component for AI/User messages
 */

import type { ConversationMessage } from "../../types/sosTypes";

interface MessageBubbleProps {
  message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAI = message.role === "ai";

  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[85%] ${
          isAI
            ? "bg-gray-100 border border-gray-200 rounded-2xl rounded-tl-md"
            : "bg-blue-600 text-white rounded-2xl rounded-tr-md"
        }`}
      >
        {/* Message content */}
        <p className={`px-4 py-3 text-sm leading-relaxed ${isAI ? "text-gray-800" : ""}`}>
          {message.content}
        </p>

        {/* Image attachment (for user messages) */}
        {message.role === "user" && message.imageUrl && (
          <div className="px-4 pb-3">
            <img
              src={message.imageUrl}
              alt="Attached"
              className="rounded-lg max-h-32 object-cover"
            />
          </div>
        )}

        {/* Selected option badge (for user messages) */}
        {message.role === "user" && message.selectedOption && (
          <div className="px-4 pb-3">
            <span className="inline-block px-2 py-0.5 bg-blue-500 rounded text-xs font-medium text-blue-100">
              {message.selectedOption}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
