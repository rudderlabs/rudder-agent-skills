# Renders the plan's table from rudder/plan.events.json, the only file that names events and their
# property types. Shipped with the rudder-setup skill. Run it unchanged:
#
#   jq -r --rawfile md rudder/plan.md -f plan-table.jq rudder/plan.events.json
#
# The "Fires in" column comes from rudder/plan.md: under the heading "## Where each event fires",
# one line per event, "- <Event Name>: <file and function>". Bold or code marks around the name and
# Windows line endings are ignored. A line for an event the JSON does not name is listed under the
# table, so a rename in one file and not the other shows at once.

def cell: tostring | gsub("\\|"; "/") | gsub("\n"; " ");
def section($lines; $heading):
  ($lines | index($heading)) as $at
  | if $at == null then []
    else $lines[$at + 1:] | ((map(startswith("## ")) | index(true)) as $stop
                             | if $stop == null then . else .[:$stop] end)
    end;
# "- **Order Completed**: src/App.tsx, checkout" gives {name: "Order Completed", place: "src/App.tsx, checkout"}.
def entry: capture("^[-*] +(?<name>[^:]+):(?<place>.*)$")
  | .name |= (gsub("[*`]"; "") | sub("^ +"; "") | sub(" +$"; ""))
  | .place |= sub("^[* ]+"; "");

. as $plan
| [section($md | gsub("\r"; "") | split("\n"); "## Where each event fires")[] | entry] as $where
| "| Event | Properties | Fires in |",
  "|---|---|---|",
  ($plan | to_entries[]
   | .key as $name
   | ([$where[] | select(.name == $name) | .place] | first // "not placed yet") as $place
   | "| \($name | cell) | \([.value | to_entries[] | "\(.key): \(.value)"] | join(", ") | cell) | \($place | cell) |"),
  ([$where[] | .name | select(. as $n | $plan | has($n) | not)]
   | if length > 0 then "", "plan.md places events that plan.events.json does not name: \(join(", "))" else empty end)
