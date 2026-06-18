export const PROMPT_MARKER_PATTERNS = [
  { label: 'ignore previous instructions', pattern: /ignore previous instructions/i },
  { label: 'system prompt', pattern: /system prompt/i },
  { label: 'prompt injection', pattern: /prompt injection/i },
  { label: 'developer message', pattern: /developer message/i },
];

export function detectPromptMarkers(texts = []) {
  const haystack = texts.filter(Boolean).map(text => String(text));
  const matches = new Set();
  for (const text of haystack) {
    for (const marker of PROMPT_MARKER_PATTERNS) {
      if (marker.pattern.test(text)) {
        matches.add(marker.label);
      }
    }
  }
  return [...matches];
}

