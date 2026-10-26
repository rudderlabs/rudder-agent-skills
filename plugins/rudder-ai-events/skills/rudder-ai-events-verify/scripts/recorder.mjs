// Stub RudderStack client for @rudderstack/ai: appends every track call to a JSONL file.
//   import { recorder } from './recorder.mjs';
//   configure({ analytics: recorder(process.env.CAPTURE_FILE ?? 'events.jsonl') });
import { appendFileSync } from 'node:fs';

export function recorder(path = 'events.jsonl') {
  return {
    track(message) {
      appendFileSync(path, JSON.stringify({ type: 'track', ...message }) + '\n');
    },
    async flush() {},
  };
}
