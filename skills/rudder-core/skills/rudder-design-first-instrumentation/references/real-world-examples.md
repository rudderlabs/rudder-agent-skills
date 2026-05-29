# Real-World Design-First Instrumentation Examples

These examples demonstrate the full design-first workflow applied to RudderStack features.

## Example 1: RudderStack Audiences Feature

### Phase 1: Requirements

```markdown
## Feature: Audiences (Data Graph)

### Business Questions
- How many customers are creating audiences?
- What's the completion rate of audience creation?
- Which condition types are most used?
- Where do users drop off in the audience builder?

### Success Metrics
- Primary: Audience creation completion rate
- Secondary: Average conditions per audience

### Funnel Stages
1. Entry: User opens Audiences section
2. Start: User begins creating an audience
3. Configure: User adds conditions
4. Complete: User saves the audience
```

### Phase 2: Event Design

```markdown
## Events for Audiences

### Event: Audiences Section Viewed
- **When:** User navigates to Audiences in the web app
- **Why track:** Measures feature discovery
- **Funnel position:** Entry

### Event: Audience Creation Started
- **When:** User clicks "Create Audience" or starts from template
- **Why track:** Measures intent
- **Funnel position:** Start

### Event: Audience Condition Added
- **When:** User adds a condition to the audience builder
- **Why track:** Measures engagement depth
- **Funnel position:** Configure

### Event: Audience Created
- **When:** User successfully saves the audience
- **Why track:** Measures completion
- **Funnel position:** Complete

### Event: Audience Creation Failed
- **When:** Save fails due to validation or API error
- **Why track:** Identifies friction
- **Funnel position:** Error
```

### Phase 4: Properties with Domain Types

The RudderStack codebase has existing types. Align properties with them:

```typescript
// Existing code types
enum ConditionGroupType {
  AND = 'and',
  OR = 'or',
  AUDIENCE = 'audience',  // Audience within audience
}

enum AudienceStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}
```

Properties should match these exact values:

```yaml
# Property using code's enum values
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "condition_group_type"
  type: "string"
  description: "Type of condition group in audience builder"
  config:
    enum:
      - "and"       # Match code exactly
      - "or"
      - "audience"
```

### Phase 5: Complete YAML

```yaml
# events/audiences.yaml
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Audience Created"
  description: "User successfully created a new audience"
  category: "urn:rudder:category/audiences"
  rules:
    - property: "urn:rudder:property/audience_id"
      required: true
    - property: "urn:rudder:property/audience_name"
      required: true
    - property: "urn:rudder:property/condition_count"
      required: true
    - property: "urn:rudder:property/condition_group_type"
      required: true
    - property: "urn:rudder:property/template_id"
    - property: "urn:rudder:property/creation_method"
---
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Audience Creation Failed"
  description: "Audience creation failed due to error"
  category: "urn:rudder:category/audiences"
  rules:
    - property: "urn:rudder:property/error_code"
      required: true
    - property: "urn:rudder:property/error_message"
      required: true
    - property: "urn:rudder:property/audience_name"
    - property: "urn:rudder:property/condition_count"
```

---

## Example 2: Transformations Feature

### Event Design for Transformations

```markdown
## Events for Transformations

### Event: Transformation Created
- **When:** User creates a new transformation
- **Why track:** Measures feature adoption
- **Properties needed:** transformation_id, language, template_type

### Event: Transformation Tested
- **When:** User runs test on transformation
- **Why track:** Measures iteration behavior
- **Properties needed:** transformation_id, test_result, execution_time_ms

### Event: Transformation Published
- **When:** User publishes transformation to production
- **Why track:** Measures completion of workflow
- **Properties needed:** transformation_id, version, connected_destination_count
```

### Aligning with Code Types

```typescript
// From the codebase
type TransformationLanguage = 'javascript' | 'python';

interface TransformationTestResult {
  success: boolean;
  output?: object;
  error?: string;
  executionTimeMs: number;
}
```

Properties should use these exact shapes:

```yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "transformation_language"
  type: "string"
  description: "Programming language of the transformation"
  config:
    enum:
      - "javascript"
      - "python"
---
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "test_result"
  type: "string"
  description: "Result of transformation test"
  config:
    enum:
      - "success"
      - "failure"
      - "timeout"
```
