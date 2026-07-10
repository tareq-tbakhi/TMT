/**
 * Typing indicator (bouncing dots) for AI processing state
 */

export function TypingIndicator() {
  return (
    <div className="mb-3 flex justify-start" role="status">
      <div className="rounded-xl rounded-ss-md border border-edge bg-surface-2 px-4 py-3">
        <div className="mb-1 text-xs font-semibold text-ink-muted">
          AI Assistant
        </div>
        <div className="flex h-5 items-center gap-1" aria-hidden="true">
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <span className="sr-only">AI Assistant is typing</span>
      </div>
    </div>
  );
}
