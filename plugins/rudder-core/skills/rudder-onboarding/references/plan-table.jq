# Renders the plan's table from rudder/plan.events.json, the only file that names events and their
# property types. Shipped with the rudder-onboarding skill. Run it unchanged:
#
#   jq -r --rawfile md rudder/plan.md -f plan-table.jq rudder/plan.events.json
#
# The "Fires in" column comes from rudder/plan.md: under the heading "## Where each event fires",
# one line per event, "- <Event Name>: <file and function>". A line for an event the JSON does not
# name is listed under the table, so a rename in one file and not the other shows at once.

def cell: tostring | gsub("\\|"; "/") | gsub("\n"; " ");
def section($lines; $heading):
  ($lines | index($heading)) as $at
  | if $at == null then []
    else $lines[$at + 1:] | ((map(startswith("## ")) | index(true)) as $stop
                             | if $stop == null then . else .[:$stop] end)
    end;
def name_of: ltrimstr("- ") | split(": ")[0];
def place_of($name): ltrimstr("- " + $name + ": ");

. as $plan
| [section($md | split("\n"); "## Where each event fires")[] | select(startswith("- ") and contains(": "))] as $where
| "| Event | Properties | Fires in |",
  "|---|---|---|",
  ($plan | to_entries[]
   | .key as $name
   | ([$where[] | select(name_of == $name) | place_of($name)] | first // "not placed yet") as $place
   | "| \($name | cell) | \([.value | to_entries[] | "\(.key): \(.value)"] | join(", ") | cell) | \($place | cell) |"),
  ([$where[] | name_of | select(. as $n | $plan | has($n) | not)]
   | if length > 0 then "", "plan.md places events that plan.events.json does not name: \(join(", "))" else empty end)
