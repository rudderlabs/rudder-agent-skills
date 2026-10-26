// Stub RudderStack client for @rudderstack/ai: appends every track call to a JSONL file.
//   import { recorder } from './recorder.mjs';
//   configure({ analytics: recorder(process.env.CAPTURE_FILE ?? 'events.jsonl') });
import { appendFileSync } from 'node:fs';

export function recorder(path = 'events.jsonl') {
  appendFileSync(path, ''); // a run that sends nothing (AI switch off, new install) still leaves a capture
  return {
    track(message) {
      appendFileSync(path, JSON.stringify({ ...message, type: 'track' }) + '\n'); // the method called wins
    },
    async flush() {},
  };
}
