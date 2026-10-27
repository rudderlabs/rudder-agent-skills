# Undo a run

Step 9 sends you here when the user asks to undo. Run each command from `work_dir`, as written, with the full path
for rudder-cli when the rule calls for it. `<record>` stands for `sh '<skill folder>/references/run-record.sh'`, and
`<dry run>` for `rudder-cli apply -l rudder --dry-run`, with `--var-file rudder/secrets.vars.yaml` if the file
exists, its output filtered as the rule says.

The run record keeps one folder per run in the git directory: the workspace the run applied to, each commit it made
and whether the undo reverts it, its copies of the key files step 6 wrote, and how far an undo of it got. A run lasts
from step 1 to step 9's summary, across sessions. The undo takes the newest run that has a commit to revert or a key
file to put back, and a later request takes the run before it. It never reverts the baseline commit or a commit
recorded as `keep`: step 1's commits of `.gitignore` lines and of the specs it found in `rudder/`, and step 6's
`.gitignore` line for an iOS app.

1. Find the run and check its workspace:
   `<record> show "$(rudder-cli workspace info --json | jq -r '.workspaceID // empty')"`. It prints the run, its
   commits, the key files it saved, how far an earlier undo of it got, and on its last line `same` when rudder-cli
   reaches the workspace that run applied to. Show the user the run and its commits. Go on only when it ends with
   `same`. Otherwise stop: the checks below compare only kinds and ids, so in another workspace that holds the same
   specs, such as production, they pass and the apply would delete that workspace's resources. Tell the user which
   workspace the token reaches now and which one the run changed, and ask them to point rudder-cli at that workspace
   with its access token before asking again. `nothing to undo` means no run in this clone left a commit to revert
   or a key file to put back.
2. Run `<dry run> | <record> unexpected`. It prints the dry run, then an `unexpected:` line for each resource the
   apply would remove that no revert of this undo took out of `rudder/`, and one when the dry run did not end with
   `exit 0`. Before any revert, every removal is unexpected. If it prints an `unexpected:` line, stop and show those
   lines: the dry run failed, or the workspace holds CLI-managed resources that `rudder/` does not, such as another
   project's, and an apply from here would delete them (fact apply-scope). After an earlier attempt's reverts, it
   expects what those reverts took out, and nothing a later commit removed, so asking again continues where that
   attempt stopped.
3. Revert the run's commits: `<record> revert`. It reverts each commit recorded for the undo, newest first, and
   skips the ones an earlier attempt reverted. If `git revert` stops on uncommitted changes, staged ones included,
   ask the user to commit or stash them and say continue, then run it again. If a commit is no longer on the branch,
   or reverting it conflicts, it stops and names the commit; tell the user and stop.
4. Put back the key files: `<record> restore`. It puts back each file that still holds what step 6 wrote, deletes
   the ones step 6 created, and names each file that changed since. For a named file, ask whether to put back the
   copy from before step 6, which drops those edits (`<record> restore '<file>'`), or to keep it and change its
   RudderStack values by hand.
5. Git removes `rudder/` when no untracked file such as the var file is left in it, so run `mkdir -p rudder`. Run
   `<dry run> | <record> unexpected` again. If it prints an `unexpected:` line, stop and show those lines: something
   was applied to the workspace since the first dry run, and apply would delete it (fact apply-scope).
6. Show the user what that dry run removes, and on a yes apply with `--confirm=false`, filtered the same way. When the
   apply exits 0, run `<record> undone` and say what it removed. If the apply fails, or the user wants to wait, stop;
   asking again continues from item 1.
