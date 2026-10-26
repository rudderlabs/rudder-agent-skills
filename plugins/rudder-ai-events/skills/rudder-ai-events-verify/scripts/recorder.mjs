// Stub RudderStack client for @rudderstack/ai: appends every call (track, identify, page, ...) to a JSONL file.
//   import { recorder } from './recorder.mjs';
//   configure({ analytics: recorder(process.env.CAPTURE_FILE ?? 'events.jsonl') });
import { appendFileSync, readFileSync } from 'node:fs';

export function recorder(path = 'events.jsonl') {
  appendFileSync(path, ''); // a run that sends nothing (AI switch off, new install) still leaves a capture
  const last = readFileSync(path).at(-1); // an unterminated last line gets a newline before the next record
  if (last !== undefined && last !== 0x0a && last !== 0x0d) appendFileSync(path, '\n');
  // @rudderstack/rudder-sdk-node methods take (message, callback); the type always names the method called
  const record = (type) => (message, callback) => {
    appendFileSync(path, JSON.stringify({ ...message, type }) + '\n');
    if (typeof callback === 'function') callback();
  };
  return {
    identify: record('identify'),
    track: record('track'),
    page: record('page'),
    screen: record('screen'),
    group: record('group'),
    alias: record('alias'),
    async flush(callback) {
      if (typeof callback === 'function') callback();
    },
  };
}
