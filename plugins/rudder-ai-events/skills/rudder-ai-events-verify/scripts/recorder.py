"""Stub RudderStack client for rudderstack-ai: appends every track call to a JSONL file.

    from recorder import Recorder
    rudderstack.ai.configure(analytics=Recorder("events.jsonl"))
"""
import json
import threading


class Recorder:
    def __init__(self, path: str = "events.jsonl") -> None:
        self.path = path
        self._lock = threading.Lock()
        # a run that sends nothing (AI switch off, new install) still leaves a capture; an existing one that
        # does not end in a newline gets one, so the next record starts its own line
        with open(path, "ab+") as f:
            f.seek(0, 2)
            if f.tell():
                f.seek(-1, 2)
                if f.read(1) not in (b"\n", b"\r"):
                    f.write(b"\n")

    # rudder-sdk-python Client.track: same parameters and order, returns (success, message)
    def track(self, user_id=None, event=None, properties=None, context=None, timestamp=None,
              anonymous_id=None, integrations=None, message_id=None):
        given = dict(user_id=user_id, event=event, properties=properties, context=context, timestamp=timestamp,
                     anonymous_id=anonymous_id, integrations=integrations, message_id=message_id)
        message = {"type": "track", **{k: v for k, v in given.items() if v is not None}}
        line = json.dumps(message, default=str)
        with self._lock, open(self.path, "a") as f:
            f.write(line + "\n")
        return True, message

    def flush(self) -> None:
        pass
