"""Stub RudderStack client for rudderstack-ai: appends every call (track, identify, page, ...) to a JSONL file.

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

    # rudder-sdk-python Client methods: same parameters and order, each returns (success, message), so the
    # recorder can replace the app's client for both AI and legacy calls
    def identify(self, user_id=None, traits=None, context=None, timestamp=None, anonymous_id=None,
                 integrations=None, message_id=None):
        return self._record("identify", locals())

    def track(self, user_id=None, event=None, properties=None, context=None, timestamp=None,
              anonymous_id=None, integrations=None, message_id=None):
        return self._record("track", locals())

    def alias(self, previous_id=None, user_id=None, context=None, timestamp=None, integrations=None,
              message_id=None):
        return self._record("alias", locals())

    def group(self, user_id=None, group_id=None, traits=None, context=None, timestamp=None, anonymous_id=None,
              integrations=None, message_id=None):
        return self._record("group", locals())

    def page(self, user_id=None, category=None, name=None, properties=None, context=None, timestamp=None,
             anonymous_id=None, integrations=None, message_id=None):
        return self._record("page", locals())

    def screen(self, user_id=None, category=None, name=None, properties=None, context=None, timestamp=None,
               anonymous_id=None, integrations=None, message_id=None):
        return self._record("screen", locals())

    def _record(self, kind, args):
        message = {"type": kind, **{k: v for k, v in args.items() if k != "self" and v is not None}}
        line = json.dumps(message, default=str)
        with self._lock, open(self.path, "a") as f:
            f.write(line + "\n")
        return True, message

    def flush(self) -> None:  # writes are unbuffered
        pass

    def join(self) -> None:
        pass

    def shutdown(self) -> None:
        pass
