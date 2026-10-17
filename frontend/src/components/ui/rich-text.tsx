import * as React from 'react';

/**
 * Renders the tiny markup engines use for things they say: `**bold**`,
 * `_italic_` and newlines. Nothing else, and never HTML.
 *
 * Engines in `lib/` decide WHAT to say without knowing how it is drawn, and a
 * string of HTML from them would have to be trusted with
 * `dangerouslySetInnerHTML`. This markup cannot express a script, a link or a
 * style, so there is nothing to trust.
 */
const TOKEN = /(\*\*[^*]+\*\*|(?<![\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}])|\n)/u;

export function RichText({ text }: { text: string }): React.ReactElement {
  const parts = text.split(TOKEN).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '\n') return <br key={i} />;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
