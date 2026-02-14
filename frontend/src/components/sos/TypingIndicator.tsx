/**
 * Typing indicator (bouncing dots) for AI processing state
 */

export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-blue-50 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="text-xs font-medium text-blue-600 mb-1">
          AI Assistant
        </div>
        <div className="flex gap-1 items-center h-5">
          <span
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}
