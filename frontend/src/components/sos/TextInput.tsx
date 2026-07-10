/**
 * Text input component for typing messages
 */

import { useState, useRef, useEffect } from "react";
import { SendHorizontal } from "lucide-react";

interface TextInputProps {
  onSend: (text: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TextInput({
  onSend,
  onTyping,
  disabled = false,
  placeholder = "Type your message...",
}: TextInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    // Signal that user is actively typing — resets inactivity timer
    if (e.target.value.length > 0 && onTyping) {
      onTyping();
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-edge bg-surface-2 px-4 py-3">
      <label htmlFor="sos-chat-input" className="sr-only">
        {placeholder}
      </label>
      <input
        ref={inputRef}
        id="sos-chat-input"
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="min-h-12 w-full flex-1 rounded-lg border border-edge-strong bg-surface px-4 text-base text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-55"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        aria-label="Send message"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent shadow-1 transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <SendHorizontal aria-hidden="true" className="h-5 w-5 rtl:-scale-x-100" />
      </button>
    </div>
  );
}
