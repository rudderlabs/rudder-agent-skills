#!/bin/sh
# The run record behind step 9's undo. Run it unchanged with sh from work_dir, by its path in the skill's folder.
# It keeps one folder per run in the git directory, under rudderstack-backup/<work_dir's path in the repository>/runs/,
# which git never commits: the workspace the run applied to, the commits it made, its copies of the key files, and
# how far an undo of it got. A run lasts from step 1 to step 9's summary; a later session continues a run that has not
# reached step 9, and starts a new one otherwise.
#
#   begin               step 1: continue the open run or start one; prints `continued <id>` or `started <id>`
#   workspace <id>      step 5, before the apply: the workspace this run changes; fails if it recorded another
#   commit revert|keep  after each commit: HEAD, for the undo to revert, or to leave alone
#   save <file>         step 6, before the first write to a git-ignored key file
#   record <file>       step 6, after the last write to it
#   forget <file>       drop the copies of a file the user keeps as it is now
#   close               step 9, after the summary
#   show [<id>]         the run an undo takes (the newest with something to undo), and whether <id> is its workspace
#   unexpected          read a filtered dry run on stdin and print it, then an `unexpected: <kind>:<id>` line for
#                       each removal that no recorded revert of the run took out of rudder/, and one when the dry
#                       run did not end with `exit 0`; exits 1 when it printed one
#   revert              revert the run's commits that are not reverted yet, newest first
#   restore [<file>]    put back the key files the run saved that still hold what it wrote; with a file, put back
#                       that one as it was before step 6 whatever it holds now. It writes the saved bytes into the
#                       file, so a key file that is a symbolic link stays one and its target gets them back
#   undone              after the undo's apply: mark the run undone and drop its copies
set -u
B=$(git rev-parse --git-path "rudderstack-backup/$(git rev-parse --show-prefix)") || exit 2
die() { echo "$*" >&2; exit 1; }
runs() { [ ! -d "$B/runs" ] || ls "$B/runs" | sort; }
newest() { runs | tail -n 1; }
# an undo that started (it reverted or put back something) and has not finished
halfway() { for r in $(runs); do [ ! -d "$B/runs/$r/undo" ] || [ -e "$B/runs/$r/undone" ] || { echo "$r"; return; }; done; }
has() { grep -qs ' revert$' "$B/runs/$1/commits" || [ -d "$B/runs/$1/undo" ] || [ -n "$(find "$B/runs/$1/files" "$B/runs/$1/created" -type f 2>/dev/null)" ]; }
# the run an undo takes: one whose undo is halfway, or else the newest one not undone that has a commit to revert or
# a file to put back
target() { r=$(halfway); [ -z "$r" ] || { echo "$r"; return; }; for r in $(runs | sort -r); do [ ! -e "$B/runs/$r/undone" ] || continue; has "$r" && { echo "$r"; return; }; done; }
cmd=${1-}; [ $# -eq 0 ] || shift
case $cmd in
begin)
  r=$(halfway); [ -z "$r" ] || die "an undo of run $r is not finished; finish it (step 9) before setting up again"
  r=$(newest)
  if [ -z "$r" ] || [ -e "$B/runs/$r/closed" ] || [ -e "$B/runs/$r/undone" ]; then
    r=$(printf '%03d-%s' $(($(runs | wc -l) + 1)) "$(date -u +%Y%m%dT%H%M%SZ)")
    mkdir -p "$B/runs/$r" && date +%s > "$B/runs/$r/began" || exit 2
    echo "started $r"
  else
    echo "continued $r"
  fi ;;
workspace|commit|save|record|forget|close)
  r=$(newest); [ -n "$r" ] || die "no run: run begin first"; R=$B/runs/$r
  case $cmd in
  workspace)
    [ -n "${1-}" ] || die "no workspace id; nothing recorded"
    if [ -s "$R/workspace_id" ] && [ "$(cat "$R/workspace_id")" != "$1" ]; then
      die "this run applied to $(cat "$R/workspace_id"); rudder-cli now reaches $1"
    fi
    echo "$1" > "$R/workspace_id" ;;
  commit)
    case ${1-} in revert|keep) ;; *) die "commit takes revert or keep" ;; esac
    h=$(git rev-parse HEAD) || exit 2
    ! cat "$B"/runs/*/commits 2>/dev/null | grep -q "^$h " || die "HEAD $h is recorded already; record a commit right after making it"
    [ "$(git log -1 --format=%ct HEAD)" -ge "$(cat "$R/began")" ] || die "HEAD $h is older than this run; record a commit right after making it"
    echo "$h $1" >> "$R/commits" ;;
  save)
    f=${1-}; [ -n "$f" ] || die "save takes a file"; d=$(dirname "$f"); mkdir -p "$R/files/$d" "$R/after/$d" "$R/created/$d"
    if [ -e "$R/files/$f" ] || [ -e "$R/created/$f" ]; then
      if ! cmp -s "$f" "$R/after/$f" && { [ -e "$f" ] || [ -e "$R/files/$f" ]; }; then echo "changed since step 6: $f"; fi
    elif [ -e "$f" ]; then cp "$f" "$R/files/$f"
    else touch "$R/created/$f"; fi ;;
  record) [ -n "${1-}" ] || die "record takes a file"; cp "$1" "$R/after/$1" ;;
  forget) [ -n "${1-}" ] || die "forget takes a file"; rm -f "$R/files/$1" "$R/after/$1" "$R/created/$1" ;;
  close) touch "$R/closed" ;;
  esac ;;
show|revert|restore|unexpected|undone)
  r=$(target)
  if [ -z "$r" ]; then [ "$cmd" = unexpected ] || { echo "nothing to undo"; exit 3; }; fi
  R=$B/runs/$r
  case $cmd in
  show)
    echo "run $r$([ -e "$R/closed" ] || echo ', stopped before step 9')"
    w=$(cat "$R/workspace_id" 2>/dev/null)
    [ ! -s "$R/commits" ] || while read -r c how; do
      echo "$how $(git log -1 --format='%h %s' "$c" 2>/dev/null || echo "$c, not in this repository")"
    done < "$R/commits"
    for s in files created; do [ ! -d "$R/$s" ] || (cd "$R/$s" && find . -type f | sed "s|^\./|$s: |"); done
    [ ! -e "$R/undo/from" ] || echo "undo started: $(cat "$R/undo/reverted" 2>/dev/null | grep -c .) reverted$([ ! -e "$R/undo/restored" ] || echo ', key files put back')"
    if [ -n "$w" ] && [ "$w" = "${1-}" ]; then echo same; else echo "recorded ${w:-none}, now ${1:-none}"; exit 1; fi ;;
  revert)
    mkdir -p "$R/undo"; [ -e "$R/undo/from" ] || git rev-parse HEAD > "$R/undo/from"; touch "$R/undo/reverted"
    for c in $(sed -n 's/ revert$//p' "$R/commits" 2>/dev/null | sed '1!G;h;$!d'); do
      ! grep -qx "$c" "$R/undo/reverted" || continue
      git merge-base --is-ancestor "$c" HEAD 2>/dev/null || die "$c is not on this branch any more (rebased or reset?); not reverting"
      if ! git revert --no-edit "$c"; then
        ! git rev-parse -q --verify REVERT_HEAD >/dev/null || git revert --abort
        die "git revert stopped on $c"
      fi
      echo "$c" >> "$R/undo/reverted"
    done ;;
  restore)
    mkdir -p "$R/undo"
    if [ -n "${1-}" ]; then
      # one file the restore named as changed, which the user wants back as it was before step 6
      f=$1; if [ -e "$R/files/$f" ]; then cat "$R/files/$f" > "$f" || exit 2; elif [ -e "$R/created/$f" ]; then rm -f "$f"; else die "no copy of $f"; fi
      rm -f "$R/files/$f" "$R/after/$f" "$R/created/$f"; exit 0
    fi
    for s in files created; do [ ! -d "$R/$s" ] || (cd "$R/$s" && find . -type f | sed 's|^\./||'); done | while IFS= read -r f; do
      if cmp -s "$f" "$R/after/$f"; then if [ -e "$R/files/$f" ]; then cat "$R/files/$f" > "$f" || continue; else rm "$f"; fi
      elif [ -e "$f" ] || [ -e "$R/files/$f" ]; then echo "changed since step 6: $f"; continue; fi
      rm -f "$R/files/$f" "$R/after/$f" "$R/created/$f"
    done
    touch "$R/undo/restored" ;;
  unexpected)
    # what this run's successful reverts took out of rudder/, as kind:id lines: what each reverted commit added, so a
    # commit made since cannot widen it. Plain diff output, whatever the user's diff settings say
    ours=$(for c in $(cat "$R/undo/reverted" 2>/dev/null); do p=$(git rev-parse -q --verify "$c^" || git hash-object -t tree /dev/null); git diff --no-ext-diff --no-color --no-textconv -U100000 "$c" "$p" -- rudder; done | awk 'function v(s) {sub(/[ \t]+#.*/, "", s); sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); q = substr(s, 1, 1); if ((q == "\"" || q == sprintf("%c", 39)) && substr(s, length(s)) == q) s = substr(s, 2, length(s) - 2); return s} /^diff --git /{k=""} /^[ -]kind:/{k=v(substr($0, 7)); if (k=="event-stream-connections") k="event-stream-connection"} /^- +(- )?id:/{sub(/^- +(- )?id:/,""); print k ":" v($0)}')
    O=$ours awk 'BEGIN { n = split(ENVIRON["O"], o, "\n"); for (i = 1; i <= n; i++) ok[o[i]] = 1 } { print } /^exit [0-9]+$/ { s = $2 } /^Removed resources:/ { r = 1; next } r && /^ / { if (/^  - /) { u = substr($0, 5); if (!(u in ok)) x[++m] = u } next } { r = 0 } END { for (i = 1; i <= m; i++) print "unexpected: " x[i]; if (s == "") { print "unexpected: no exit status; run the dry run through the rule'"'"'s filter"; m++ } else if (s != "0") { print "unexpected: the dry run ended with exit " s; m++ } exit m > 0 }' ;;
  undone)
    rm -rf "$R/files" "$R/after" "$R/created"; touch "$R/undone" ;;
  esac ;;
*) die "usage: run-record.sh begin|workspace <id>|commit revert|keep|save <file>|record <file>|forget <file>|close|show [<id>]|unexpected|revert|restore [<file>]|undone" ;;
esac
