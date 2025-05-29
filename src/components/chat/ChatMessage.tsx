
// src/components/chat/ChatMessage.tsx
"use client";

import type { ChatMessage as ChatMessageType } from '@/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.sender === 'user';

  return (
    <div className={cn("flex items-start gap-3 py-3 my-2", isUser ? "justify-end pl-8 sm:pl-12" : "pr-8 sm:pr-12")}> {/* Added my-2 and pl/pr for width constraint */}
      {!isUser && (
        <Avatar className="h-8 w-8 border border-primary/50 shrink-0"> 
          <AvatarFallback><Bot size={18} className="text-primary" /></AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-lg p-3 text-sm", // Adjusted max-w, base text size
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground border border-border" 
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <pre className="bg-muted/50 p-2.5 rounded-md overflow-x-auto my-2 text-sm"> {/* Slightly more padding */}
                  <code className={className} {...props}>
                    {String(children).replace(/\n$/, '')}
                  </code>
                </pre>
              ) : (
                <code className={cn(className, "bg-muted/50 px-1 py-0.5 rounded text-sm")} {...props}>
                  {children}
                </code>
              );
            },
            p({children}) {
              return <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p> // Adjusted spacing and leading
            },
            ul({children}) {
              return <ul className="list-disc list-inside pl-4 my-1.5 space-y-0.5">{children}</ul> // Adjusted spacing
            },
            ol({children}) {
              return <ol className="list-decimal list-inside pl-4 my-1.5 space-y-0.5">{children}</ol> // Adjusted spacing
            },
            li({children}) {
              return <li className="mb-0.5">{children}</li> // Adjusted spacing
            }
          }}
        >
          {message.content}
        </ReactMarkdown>
        <p className={cn("text-xs mt-2 text-right", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}> {/* Adjusted margin-top and alignment */}
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <Avatar className="h-8 w-8 border border-border shrink-0">
          <AvatarFallback><User size={18} /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
