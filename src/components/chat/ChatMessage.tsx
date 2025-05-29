// src/components/chat/ChatMessage.tsx
"use client";

import type { ChatMessage as ChatMessageType } from '@/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.sender === 'user';

  return (
    <div className={cn("flex items-start gap-3 py-3", isUser ? "justify-end" : "")}>
      {!isUser && (
        <Avatar className="h-8 w-8 border border-primary">
          <AvatarFallback><Bot size={18} className="text-primary" /></AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-lg p-3 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border"
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <pre className="bg-muted p-2 rounded-md overflow-x-auto my-2 text-sm">
                  <code className={className} {...props}>
                    {String(children).replace(/\n$/, '')}
                  </code>
                </pre>
              ) : (
                <code className={cn(className, "bg-muted px-1 py-0.5 rounded text-sm")} {...props}>
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
        <p className={cn("text-xs mt-1", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
      {isUser && (
        <Avatar className="h-8 w-8 border">
          <AvatarFallback><User size={18} /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
