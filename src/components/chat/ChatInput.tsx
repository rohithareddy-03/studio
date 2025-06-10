
// src/components/chat/ChatInput.tsx
"use client";

import { useState, FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SendHorizonal, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSubmitQuery: (query: string) => Promise<void>;
  isLoading: boolean;
  placeholderText: string;
  disabled?: boolean; // Optional: if the input itself should be disabled
}

export function ChatInput({
  onSubmitQuery,
  isLoading,
  placeholderText,
  disabled = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    await onSubmitQuery(message.trim());
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 border-t border-border/50 p-3 bg-background/80">
      <Input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholderText}
        className="flex-grow h-10 rounded-full bg-background focus:border-primary/70 pl-4 pr-12 text-sm"
        disabled={disabled || isLoading}
        aria-label="Chat message input"
      />
      <Button type="submit" disabled={disabled || isLoading || !message.trim()} size="icon" className="rounded-full w-10 h-10 bg-primary hover:bg-primary/90">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizonal size={20} />}
      </Button>
    </form>
  );
}
