
// src/components/chat/ChatMessage.tsx
"use client";

import type { ChatMessage as ChatMessageType } from '@/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar'; // Removed AvatarImage as it's not used
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.sender === 'user';

  return (
    <div className={cn("flex items-start gap-3 py-3 my-1", isUser ? "justify-end" : "")}> {/* Added my-1 for a bit more vertical separation */}
      {!isUser && (
        <Avatar className="h-8 w-8 border border-primary/50"> {/* Softer border for AI avatar */}
          <AvatarFallback><Bot size={18} className="text-primary" /></AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-lg p-3 ", // Removed shadow-sm
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground border border-border" // Use secondary for AI, add border
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <pre className="bg-muted/50 p-2 rounded-md overflow-x-auto my-2 text-sm"> {/* Lighter pre background */}
                  <code className={className} {...props}>
                    {String(children).replace(/\n$/, '')}
                  </code>
                </pre>
              ) : (
                <code className={cn(className, "bg-muted/50 px-1 py-0.5 rounded text-sm")} {...props}> {/* Lighter inline code bg */}
                  {children}
                </code>
              );
            },
            p({children}) {
              return <p className="mb-2 last:mb-0">{children}</p>
            },
            ul({children}) {
              return <ul className="list-disc list-inside pl-4 mb-2">{children}</ul>
            },
            ol({children}) {
              return <ol className="list-decimal list-inside pl-4 mb-2">{children}</ol>
            },
            li({children}) {
              return <li className="mb-1">{children}</li>
            }
          }}
        >
          {message.content}
        </ReactMarkdown>
        <p className={cn("text-xs mt-1.5", isUser ? "text-primary-foreground/80" : "text-muted-foreground")}> {/* Slightly increased margin-top */}
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {/* Simplified time format */}
        </p>
      </div>
      {isUser && (
        <Avatar className="h-8 w-8 border border-border">
          <AvatarFallback><User size={18} /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
