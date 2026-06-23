# Session Lifecycle Patterns

Guidance on identify, group, and track calls for multi-tenant SaaS applications like RudderStack.

## The Three-Layer Model

For applications with User → Organization → Workspace hierarchy:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CALL SEMANTICS                               │
└─────────────────────────────────────────────────────────────────────┘

IDENTIFY → User traits (permanent, context-independent)
    │
GROUP → Organization membership (called per org, not per workspace)
    │
TRACK → Events with workspace context (operational state)
```

| Call | Purpose | Contains | When to Call |
|------|---------|----------|--------------|
| **Identify** | Establish user identity | User traits only | Login, signup, profile update |
| **Group** | Associate with organization | Org traits (plan, is_trial) | Org join, org access, org trait changes |
| **Track** | Record actions | Event + workspace context | Every meaningful action |

---

## Identify Call

**Purpose:** Establish who the user is with permanent attributes.

**When to call:**
- Signup (first identification)
- Login (re-establish for session)
- Profile update (email changed, name changed)

### Shape

```typescript
interface IdentifyTraits {
  email: string;
  name: string;
  created_at: string;      // ISO 8601
  phone?: string;
  avatar_url?: string;
  // Attributes intrinsic to the USER
}
```

### What Does NOT Belong

- `workspace_id` — operational context, not user trait
- `org_id` — use group call instead
- `plan`, `is_trial` — organization attributes

### Example

```javascript
analytics.identify(userId, {
  email: user.email,
  name: user.name,
  created_at: user.createdAt,
});
```

---

## Group Call

**Purpose:** Associate user with an organization and describe that organization.

**Key insight:** Group establishes **membership**, not **current operating context**. A user can be a member of multiple orgs. Calling `group()` doesn't "switch" context — it records an association.

**When to call:**
- User joins an organization
- User first accesses an organization in a session
- Organization attributes change (plan upgrade, trial ends)

### Shape

```typescript
interface GroupTraits {
  name: string;              // Org name
  plan: string;              // Org's plan (free, starter, growth, enterprise)
  is_trial: boolean;         // Org's trial status
  industry?: string;
  employee_count?: number;
  created_at: string;        // When org was created
  // Attributes of the ORGANIZATION
}
```

### Example

```javascript
analytics.group(orgId, {
  name: org.name,
  plan: org.plan,
  is_trial: org.isTrial,
  created_at: org.createdAt,
});
```

---

## Track Call with Workspace Context

**Purpose:** Record an action with its properties and operational context.

**Key insight:** Workspace is operational context, not organizational membership. It belongs in track calls, not group calls.

### Shape

```typescript
interface TrackCall {
  event: string;
  properties: {
    // Event-specific data
    [key: string]: any;
  };
  context: {
    workspace_id: string;
    workspace_name?: string;
  };
}
```

### Example

```javascript
analytics.track('Transformation Created', {
  transformation_id: 'tr_123',
  language: 'javascript',
}, {
  context: {
    workspace_id: currentWorkspace.id,
    workspace_name: currentWorkspace.name,
  }
});
```

### Middleware Pattern (Recommended)

Auto-include workspace context on all track calls:

```typescript
analytics.addSourceMiddleware(({ payload, next }) => {
  if (payload.type() === 'track') {
    payload.obj.context = {
      ...payload.obj.context,
      workspace: {
        id: getCurrentWorkspaceId(),
        name: getCurrentWorkspaceName(),
      },
    };
  }
  next(payload);
});
```

---

## What to Call When

| Event | What to Call |
|-------|--------------|
| User signs up | `identify(userId, traits)` |
| User logs in | `identify(userId, traits)` |
| User updates profile | `identify(userId, updatedTraits)` |
| User accesses org (first time or switch) | `group(orgId, orgTraits)` |
| Org plan changes | `group(orgId, { plan: newPlan })` |
| User switches workspace (same org) | Update track context only — no identify or group |
| User switches to different org | `group(newOrgId, newOrgTraits)` + update track context |

---

## Anti-Patterns

### ❌ Org/Workspace Attributes on Identify

```javascript
// BAD - these don't belong on the user
analytics.identify(userId, {
  workspace_id: "ws_123",  // Operational context
  is_trial: true,          // Org attribute
  plan: "enterprise",      // Org attribute
});

// GOOD - separate concerns
analytics.identify(userId, { email, name, created_at });
analytics.group(orgId, { plan, is_trial });
// workspace_id flows through track context
```

### ❌ Group Call on Workspace Switch

```javascript
// BAD - group is for org membership, not workspace context
function onWorkspaceSwitch(newWorkspaceId) {
  analytics.group(newWorkspaceId, { name: workspace.name });
}

// GOOD - update track context only
function onWorkspaceSwitch(newWorkspaceId) {
  setCurrentWorkspaceContext(newWorkspaceId);
  // Subsequent track calls will include new workspace_id
}
```

### ❌ Calling Identify on Context Change

```javascript
// BAD - identify is for user traits, not context
function onWorkspaceSwitch(newWorkspaceId) {
  analytics.identify(userId, { workspace_id: newWorkspaceId });
}

// GOOD - context flows through track
function onWorkspaceSwitch(newWorkspaceId) {
  analyticsContext.setWorkspace(newWorkspaceId);
}
```

---

## Real-World Example: Multi-Tenant Project Management App

### Hierarchy

A typical B2B SaaS with User → Organization → Project structure:

```
User (jane@example.com)
├── Org: Acme Corp (group call when accessed)
│   ├── Project: Marketing Campaign (track context)
│   └── Project: Product Launch (track context)
└── Org: Freelance Clients (group call when accessed)
    └── Project: Website Redesign (track context)
```

### Implementation

```typescript
class AnalyticsService {
  private currentProjectId: string | null = null;
  private currentOrgId: string | null = null;

  // Called on login
  identifyUser(user: User) {
    analytics.identify(user.id, {
      email: user.email,
      name: user.name,
      created_at: user.createdAt,
    });
  }

  // Called when user accesses an org
  setOrganization(org: Organization) {
    if (org.id !== this.currentOrgId) {
      this.currentOrgId = org.id;
      analytics.group(org.id, {
        name: org.name,
        plan: org.plan,           // 'free' | 'team' | 'business' | 'enterprise'
        is_trial: org.isTrial,
        industry: org.industry,
      });
    }
  }

  // Called when user switches project (no group call needed if same org)
  setProject(projectId: string) {
    this.currentProjectId = projectId;
    // No analytics call - context flows through track
  }

  // All track calls include project context
  track(event: string, properties: Record<string, any>) {
    analytics.track(event, {
      ...properties,
      project_id: this.currentProjectId,
    });
  }
}
```

### Usage

```typescript
const analytics = new AnalyticsService();

// User logs in
analytics.identifyUser(user);

// User accesses Acme Corp org
analytics.setOrganization(acmeCorpOrg);

// User is in Marketing Campaign project
analytics.setProject('proj_marketing_123');

// User creates a task
analytics.track('Task Created', {
  task_id: 'task_456',
  task_name: 'Design landing page',
  priority: 'high',
});
// Event includes project_id: 'proj_marketing_123'

// User switches to Product Launch project (same org)
analytics.setProject('proj_launch_789');
// No group call needed!

// User creates another task
analytics.track('Task Created', {
  task_id: 'task_790',
  task_name: 'Prepare demo',
  priority: 'medium',
});
// Event includes project_id: 'proj_launch_789'

// User switches to Freelance Clients org (different org!)
analytics.setOrganization(freelanceOrg);  // Group call fires
analytics.setProject('proj_website_001');

// Now events include freelance org context and new project
analytics.track('Task Created', {
  task_id: 'task_801',
  task_name: 'Review mockups',
  priority: 'high',
});
```

---

## Querying Multi-Project Data

With this pattern, you can answer questions like:

```sql
-- Users in Enterprise orgs (from group traits)
SELECT DISTINCT user_id
FROM groups
WHERE plan = 'enterprise';

-- Tasks created per project (from track context)
SELECT
  context_project_id,
  COUNT(*) as task_count
FROM tracks
WHERE event = 'Task Created'
GROUP BY context_project_id;

-- Users active in multiple projects
SELECT
  user_id,
  COUNT(DISTINCT context_project_id) as project_count
FROM tracks
GROUP BY user_id
HAVING project_count > 1;

-- Cross-org activity (users working across multiple organizations)
SELECT
  u.user_id,
  u.email,
  COUNT(DISTINCT g.group_id) as org_count
FROM users u
JOIN groups g ON u.user_id = g.user_id
GROUP BY u.user_id, u.email
HAVING org_count > 1;
```

---

## Summary

| Data | Where It Belongs | Rationale |
|------|------------------|-----------|
| `user_id`, `email`, `name` | Identify | User attributes |
| `org_id`, `plan`, `is_trial` | Group | Organization attributes |
| `project_id` (or `workspace_id`) | Track context | Operational context at time of event |

## Internal Examples

For RudderStack-specific examples of this pattern (Workspaces, Transformations), see `rudder-code-first-instrumentation/references/internal-rudderstack-examples.md`.
