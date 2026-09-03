# Scripted demo

The [guide](../README.md) as a presentable terminal walkthrough, driven by
[demo-magic](https://github.com/paxtonhare/demo-magic) (MIT, vendored here as
`demo-magic.sh` with its licence).

```bash
./demo.sh          # present it — simulated typing, ENTER between steps
./demo.sh -d       # no typing simulation (and no `pv` needed)
./demo.sh -n       # don't wait for ENTER
./demo.sh -w5      # auto-advance after 5s
```

Roughly 4 minutes presented, ~20 seconds with `-d -n`.

## Requirements

- `rudder-cli` >= 0.22.0, Node 20+, and `(cd ../app && npm install)` already run —
  the script checks all three and exits with the fix if any is missing.
- `pv` for the typing simulation (`brew install pv`). Not needed with `-d`.

## What it shows

1. The contract lives in the catalog — event identity, then the plan's rule.
2. `tp:sync` generates the client from files on disk. No workspace, apply, auth or network.
3. What came out: the payload interface, and the resolver-only constructor.
4. Making one property required breaks five call sites across three files.
5. Reverting is byte-identical — the wrong fix is a cast, the right one is the YAML.
6. A description-only change passes typecheck, tests and build, and only `tp:check` catches it.

## It edits the catalog, and puts it back

Steps 4 and 6 really do modify `../catalog` and regenerate the client — the output is
real, not staged. Both directories are copied to a temp dir before anything runs and
restored on exit, **including on Ctrl-C**.

The restore is guarded and runs exactly once: only `EXIT` triggers it, with `INT` and
`TERM` re-raised as an exit. Trapping the restore on all three runs it twice, and the
second pass finds no backup — which deletes the very files it was meant to protect.
