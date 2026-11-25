import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { shouldCollapseUserPrompt } from '../../utils/chatDisplay';

interface CollapsibleUserPromptProps {
  text: string;
}

export const CollapsibleUserPrompt: React.FC<CollapsibleUserPromptProps> = ({
  text,
}) => {
  const cleanText = String(text || '').trim();
  const isCollapsible = shouldCollapseUserPrompt(cleanText);
  const [expanded, setExpanded] = useState(false);

  if (!cleanText) return null;

  return (
    <div className="msg-user-bubble" data-testid="user-prompt-bubble">
      <div
        data-testid="user-prompt-text"
        className={`whitespace-pre-wrap break-words ${
          isCollapsible && !expanded ? 'line-clamp-3' : ''
        }`}
      >
        {cleanText}
      </div>

      {isCollapsible && (
        <button
          type="button"
          data-testid="user-prompt-see-more-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--primary)] hover:opacity-80 transition-opacity cursor-pointer select-none"
        >
          <span>{expanded ? 'See less' : 'See more'}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
};
