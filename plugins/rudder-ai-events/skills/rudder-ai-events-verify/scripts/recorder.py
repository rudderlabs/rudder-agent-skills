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

    def track(self, **message) -> None:  # rudder-sdk-python keyword arguments: user_id, anonymous_id, event, ...
        line = json.dumps({"type": "track", **message}, default=str)
        with self._lock, open(self.path, "a") as f:
            f.write(line + "\n")

    def flush(self) -> None:
        pass
