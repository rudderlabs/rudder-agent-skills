## Summary

Brief description of the change.

---

## Plugin(s) affected

- [ ] rudder-core
- [ ] rudder-cli
- [ ] rudder-mcp
- [ ] rudder-terraform
- [ ] Repo-wide (CI, scripts, docs)

---

## Changes

- Key change 1
- Key change 2

---

## Skill testing

For new or modified skills:

- **Prompt that should trigger:** (copy-pasteable)
- **Prompt that should NOT trigger:** (verifies description is narrow)
- **Linter passes:** `python3 scripts/review-skills.py . --strict`

---

## Risk / Impact

Low / Medium / High

---

## Checklist

- [ ] Linter passes (`scripts/review-skills.py . --strict`)
- [ ] Version bumped in `marketplace.json` if behavior materially changed
- [ ] CHANGELOG updated under `[Unreleased]`
- [ ] No secrets, customer names, or internal URLs
