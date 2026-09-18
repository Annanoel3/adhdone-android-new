import React from 'react';

// One line in the first-run conversation. Anna's lines sit left in a muted
// bubble; the user's answers sit right in the primary colour so the screen
// reads like a chat they took part in, not a form they filled out.
export default function ChatBubble({ from, children }) {
  const mine = from === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          mine
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        {children}
      </div>
    </div>
  );
}