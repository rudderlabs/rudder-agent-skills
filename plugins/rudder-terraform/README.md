# rudder-terraform

Skills for managing RudderStack with the Terraform provider: install Terraform and configure the provider, author resources, run init, plan and apply, and import what you already have.

## What's included

- `rudder-terraform-setup`: Installs Terraform and configures the RudderStack provider.
- `rudder-terraform-workflow`: Manages RudderStack resources via the terraform-provider-rudderstack.

## Install

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-terraform@rudder-agent-skills
```

To pick single skills instead, or to use another agent such as Cursor, use the Skills CLI: `npx skills add rudderlabs/rudder-agent-skills --skill <skill-name>`.

## Data handling

The plugin ships skills only. It stores no data and sends nothing anywhere itself. The tools your agent runs because of these skills use your own RudderStack credentials, so they only see what your account is allowed to see.

## Links

- Repository: https://github.com/rudderlabs/rudder-agent-skills
- Homepage: https://github.com/rudderlabs/terraform-provider-rudderstack
- License: MIT
