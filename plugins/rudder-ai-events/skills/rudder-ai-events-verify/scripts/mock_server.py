"""Mock RudderStack data plane and OpenAI/Anthropic endpoints. Writes every tracked message to events.jsonl."""
import gzip
import itertools
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUT = sys.argv[2] if len(sys.argv) > 2 else "events.jsonl"
# a run that sends nothing (AI switch off, new install) still leaves a capture; an existing one that does not
# end in a newline gets one, so the next record starts its own line
with open(OUT, "ab+") as f:
    f.seek(0, 2)
    if f.tell():
        f.seek(-1, 2)
        if f.read(1) not in (b"\n", b"\r"):
            f.write(b"\n")


CALLS = itertools.count(1)  # a fresh response ID per model call: SDKs count calls by response ID


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length") or 0))
        try:
            if self.headers.get("content-encoding") == "gzip":  # both RudderStack server SDKs gzip batches
                raw = gzip.decompress(raw)
            body = json.loads(raw or b"{}")
        except Exception as exc:  # always answer, so a bad body never leaves the app retrying
            print(f"mock: unreadable body on {self.path}: {exc}", file=sys.stderr)
            return self._json(200, {})
        path = self.path.split("?", 1)[0]  # Azure OpenAI adds ?api-version=, Anthropic beta clients ?beta=true
        if path.endswith("/v1/batch"):  # RudderStack data plane
            with open(OUT, "a") as f:
                for message in body.get("batch", []):
                    f.write(json.dumps(message) + "\n")
            return self._json(200, {})
        if path.endswith("/chat/completions"):  # OpenAI Chat Completions (non-streaming)
            tools = [t["function"]["name"] for t in body.get("tools", []) if t.get("type") == "function"]
            last = str((body.get("messages") or [{}])[-1].get("content", ""))
            call = next((name for name in tools if f"call:{name}" in last), None)
            if call:  # a prompt containing "call:<tool>" gets a tool call, to exercise event_rules
                return self._json(200, {
                    "id": f"chatcmpl-mock-tool-{next(CALLS)}", "object": "chat.completion", "created": 0,
                    "model": body.get("model", "mock"),
                    "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                        "role": "assistant", "content": None, "tool_calls": [{
                            "id": "call_mock_1", "type": "function",
                            "function": {"name": call, "arguments": json.dumps({"priority": "high"})}}]}}],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17},
                })
            return self._json(200, {
                "id": f"chatcmpl-mock-{next(CALLS)}", "object": "chat.completion", "created": 0, "model": body.get("model", "mock"),
                "choices": [{"index": 0, "finish_reason": "stop",
                             "message": {"role": "assistant", "content": "Mock answer."}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15},
            })
        if path.endswith("/v1/messages"):  # Anthropic Messages (non-streaming)
            return self._json(200, {
                "id": f"msg_mock_{next(CALLS)}", "type": "message", "role": "assistant", "model": body.get("model", "mock"),
                "content": [{"type": "text", "text": "Mock answer."}], "stop_reason": "end_turn",
                "stop_sequence": None, "usage": {"input_tokens": 12, "output_tokens": 3},
            })
        return self._json(404, {"error": f"mock has no route {self.path}"})

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8787), Handler).serve_forever()
