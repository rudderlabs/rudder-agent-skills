# Compares the events `rudder-cli sources listen` captured with the agreed plan.
# Shipped with the rudder-onboarding skill. Run it unchanged; never edit it to make a check pass.
#
#   jq -n --slurpfile plan rudder/plan.events.json --rawfile events EVENTS --rawfile log LOG \
#         --argjson from N --argjson logfrom M -f check-events.jq
#
# EVENTS is the listener's stdout file and LOG its stderr file. N and M are their line counts
# (`wc -l`) taken just before the user acted, so only that pass is checked. The plan maps each
# event name to its properties and their types: {"Order Completed": {"total": "number"}}.
#
# pass is false only when a planned event is missing or one of its properties has another type.
# Events outside the plan, refused requests and lines that are not JSON are reported, never failed.
# complete is true once every planned event has arrived and no line is half-written.
# A plan that is not in that shape stops jq with an error, so the caller can tell it from a failed check.

def kind: if type == "number" then (if . == floor then "integer" else "number" end) else type end;
def fits($want): . == $want or ($want == "number" and . == "integer");
# A line counts once its newline is written; text after the last newline is still being written.
def complete_lines: split("\n") | .[:-1];
def cell: tostring | gsub("\\|"; "/") | gsub("\n"; " ");

$plan[0] as $p
| if ($p | type) != "object" or ($p | length) == 0
    or any($p[]; type != "object" or any(.[]; IN("string", "number", "integer", "boolean") | not))
  then error("the plan must map each event name to {\"property\": \"string|number|integer|boolean\"}")
  else . end
| ($events != "" and ($events | endswith("\n") | not)) as $partial
| ($events | complete_lines | .[$from:]) as $lines
| [$lines[] | fromjson?] as $parsed
| [$parsed[] | objects | select(.event | type == "string")] as $tracks
| ($log | complete_lines | .[$logfrom:]) as $loglines
| [$p | to_entries[] | .key as $name | .value as $props
   | [$tracks[] | select(.event == $name)] as $got
   | {event: $name, received: ($got | length),
      properties: [$props | to_entries[] | .key as $k | .value as $want
        | {property: $k, expected: $want,
           received: ([$got[] | .properties | if type == "object" and has($k) then .[$k] | kind else "missing" end] | unique)}
        | .ok = ((.received | length) > 0 and all(.received[]; fits($want)))],
      extra: ([$got[] | .properties | objects | keys[]] | unique - ($props | keys))}
   | .status = (if .received == 0 then "missing" elif all(.properties[]; .ok) then "ok" else "wrong_type" end)
  ] as $rows
| [$tracks[] | .event | select(. as $e | $p | has($e) | not)] as $other
| [$other | group_by(.)[] | {event: .[0], received: length}] as $unexpected
| [$loglines[] | select(startswith("refused: "))] as $refused
| [$loglines[] | select(startswith("{\"error\""))] as $errors
| (($lines | length) - ($parsed | length)) as $unparsed
| {pass: all($rows[]; .status == "ok"),
   complete: (all($rows[]; .received > 0) and ($partial | not)),
   lines: ($lines | length),
   pending: (if $partial then 1 else 0 end),
   unparsed: $unparsed,
   nonTrack: (($parsed | length) - ($tracks | length)),
   events: $rows,
   unexpected: $unexpected,
   refused: $refused,
   errors: $errors,
   table: ([
     "| Event | Expected | Received | Result |",
     "|---|---|---|---|",
     ($rows[] | "| \(.event | cell) | \([.properties[] | "\(.property): \(.expected)"] | join(", ") | cell) | \(.received)"
        + (if .received == 0 then "" else " × " + ([.properties[] | "\(.property): \(.received | join("/"))"] | join(", ") | cell) end)
        + " | \({ok: "ok", missing: "missing", wrong_type: "wrong type"}[.status]) |"),
     ($unexpected[] | "| \(.event | cell) | not in the plan | \(.received) | reported, not a failure |"),
     ($refused[] | "| | | \(cell) | reported, not a failure |"),
     (if $unparsed > 0 then "| | | \($unparsed) line(s) that are not JSON | reported, not a failure |" else empty end),
     (if $partial then "| | | 1 half-written line, read on the next check | waiting |" else empty end)
   ] | join("\n"))}
