# Round-trip and adoption patterns

Deeper patterns for `get -o yaml` + `apply -f` and for adopting unmanaged
resources with `set-external-id`. Load this when a task needs the exact flow.

## The get -o yaml → apply -f round-trip

`rudder-cli get <type> <id> -o yaml` emits the **same re-appliable spec** that
`apply -f` consumes. So exporting and re-applying an unchanged resource is a
no-op — which makes it a safe, drift-free way to edit one resource:

```bash
# 1. Export the live resource to a file
rudder-cli get event-stream-source orders -o yaml > sources/orders.yaml

# 2. Re-applying it unchanged shows no changes
rudder-cli apply -f sources/orders.yaml --dry-run --confirm=false
#   -> "No changes to apply"

# 3. Edit a field, then apply just this file (scoped, never deletes)
#    (change spec.name, a governance/tracking-plan ref, etc.)
rudder-cli apply -f sources/orders.yaml --dry-run --confirm=false   # review the diff
rudder-cli apply -f sources/orders.yaml --confirm=false             # apply
```

Why this beats hand-writing YAML: the exported spec already has the exact
shape, ids, and any import metadata the server expects, so the first re-apply is
guaranteed clean and every subsequent diff is exactly your edit.

**Limitation.** Single-resource export loads only the target's own provider, so a
cross-provider reference (e.g. an event-stream source pointing at a tracking plan
owned by another provider) may not fully resolve in the emitted YAML. For those,
manage the resources together through the normal project apply cycle
(`rudder-cli-workflow`) instead.

## Adopting an unmanaged resource

A resource created outside IaC (e.g. in the dashboard) has **no external id** —
it shows `MANAGED=no` with a blank `EXTERNAL-ID`. `set-external-id` associates it
with a local external id, bringing it under IaC management without recreating it.

```bash
# 1. Find it — note the REMOTE-ID column
rudder-cli get event-stream-source --unmanaged
# EXTERNAL-ID  REMOTE-ID                    NAME                  MANAGED
#              2Is8tBS8zFG3ensBtLT7ZN7BFuB  Legacy Orders Source  no

# 2. Claim it: <type> <remote-id> <new-external-id>
rudder-cli set-external-id event-stream-source 2Is8tBS8zFG3ensBtLT7ZN7BFuB orders-pipeline

# 3. It is now managed and addressable by its external id
rudder-cli get event-stream-source orders-pipeline
rudder-cli get event-stream-source orders-pipeline -o yaml > sources/orders.yaml
```

From here it behaves like any managed resource: export it, keep it in your
project, `apply -f` edits, or `delete` it.

Notes:
- Adoption is a one-way claim — there is no CLI "un-manage". Once adopted, a
  whole-project `apply --location` that lacks the resource in local specs would
  delete it; keep adopted resources in your project (or use scoped `apply -f`).
- Capability-gated: only providers that expose a setter accept `set-external-id`.
  Read-only types like `account` refuse it.

## Wiring a delete safely

```bash
# Inspect before removing
rudder-cli describe event-stream-source orders-pipeline
# Remove (managed resources only; unmanaged are rejected)
rudder-cli delete event-stream-source orders-pipeline --confirm
```

If `delete` reports the resource is unmanaged, it has no external id — adopt it
with `set-external-id` first if IaC-managed deletion is really intended, or remove
it in the dashboard.
