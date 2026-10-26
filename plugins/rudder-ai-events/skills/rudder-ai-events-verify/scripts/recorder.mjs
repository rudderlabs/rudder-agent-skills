// Stub RudderStack client for @rudderstack/ai: appends every track call to a JSONL file.
//   import { recorder } from './recorder.mjs';
//   configure({ analytics: recorder(process.env.CAPTURE_FILE ?? 'events.jsonl') });
import { appendFileSync, readFileSync } from 'node:fs';

export function recorder(path = 'events.jsonl') {
  appendFileSync(path, ''); // a run that sends nothing (AI switch off, new install) still leaves a capture
  const last = readFileSync(path).at(-1); // an unterminated last line gets a newline before the next record
  if (last !== undefined && last !== 0x0a && last !== 0x0d) appendFileSync(path, '\n');
  return {
    track(message) {
      appendFileSync(path, JSON.stringify({ ...message, type: 'track' }) + '\n'); // the method called wins
    },
    async flush() {},
  };
}
