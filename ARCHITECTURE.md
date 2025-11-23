# Architecture

## Overview

The Temporal Workflow Engine is a declarative workflow orchestration system that executes YAML-defined workflows as Directed Acyclic Graphs (DAGs). It leverages Temporal's durability and reliability while providing a simple, code-free workflow definition experience.

## Core Components

### 1. Workflow Runner (`src/workflow.ts`)

The heart of the engine - a Temporal workflow function that:

- **Parses DAG**: Validates and topologically sorts workflow steps
- **Executes Steps**: Runs activities in dependency order with parallel execution
- **Handles Signals**: Supports external events and human-in-the-loop workflows
- **Manages State**: Tracks step results and makes them available for templating
- **Error Handling**: Implements retry logic and dependency propagation

**Key Features:**
- Conditional execution via `when` clauses
- Per-step timeout configuration
- Mustache templating for dynamic inputs
- Signal-based steps for external events

### 2. Activity Registry (`src/activities.ts`)

Collection of reusable activity functions that:

- Run in the worker process (not in workflow)
- Can perform I/O, API calls, database operations
- Are automatically registered and available to workflows
- Can use non-deterministic operations

**Extensibility:**
Add new activities by simply adding functions to the `activities` object.

### 3. DSL Loader (`src/loader.ts`)

Parses and validates YAML workflow definitions:

- Loads YAML files
- Validates structure (name, steps, etc.)
- Checks for duplicate step IDs
- Validates dependencies exist
- Returns typed `WorkflowDefinition`

### 4. DAG Validator (`src/toposort.ts`)

Ensures workflow integrity:

- Detects circular dependencies
- Validates all dependencies exist
- Provides topological execution order
- Uses `dependency-graph` library

### 5. Type Definitions (`src/types.ts`)

TypeScript interfaces for:
- `WorkflowDefinition` - Complete workflow structure
- `StepDefinition` - Individual step configuration
- `StepResult` - Execution results
- `WorkflowContext` - Templating context

## Data Flow

```
┌─────────────────┐
│  YAML File      │
│  (DSL)          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Loader         │
│  - Parse YAML   │
│  - Validate     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  DAG Validator  │
│  - Check cycles │
│  - Topo sort    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Workflow       │
│  Runner         │
│  - Execute DAG  │
│  - Handle retry │
│  - Templating   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Activities     │
│  - Business     │
│    logic        │
└─────────────────┘
```

## Execution Model

### Step Execution Order

1. **Topological Sort**: Steps are sorted based on dependencies
2. **Parallel Execution**: Independent steps run in parallel
3. **Sequential Dependencies**: Dependent steps wait for prerequisites
4. **Conditional Skipping**: Steps with unmet `when` conditions are skipped
5. **Error Propagation**: Failed/skipped steps cause dependents to skip

### Templating Resolution

```typescript
// Context available to Mustache templates
{
  inputs: {
    // Workflow inputs
    user: { name: "Alice", email: "alice@example.com" }
  },
  step: {
    // Previous step results
    validate_input: {
      result: { isValid: true }
    },
    create_user: {
      result: { userId: "user_123", status: "active" }
    }
  }
}
```

### Signal Handling

Signal steps pause workflow execution until an external signal arrives:

1. Step marked with `type: signal`
2. Workflow waits at that step
3. External client sends signal: `handle.signal('step', stepId, payload)`
4. Workflow resumes with signal payload as step result

## Temporal Integration

### Workflow Function

- **Deterministic**: Uses Temporal's deterministic APIs
- **Durable**: Survives worker restarts
- **Versioned**: Can be updated with Temporal's versioning

### Activities

- **Idempotent**: Should handle retries gracefully
- **Timeout-aware**: Respect configured timeouts
- **Retryable**: Automatic retry with exponential backoff

### Worker

- Bundles workflow code with Webpack
- Registers activities
- Polls task queue for work
- Executes workflows and activities

## Scalability Considerations

### Horizontal Scaling

- **Multiple Workers**: Run multiple worker processes
- **Task Queues**: Partition work across queues
- **Activity Workers**: Separate activity-only workers

### Performance

- **Parallel Execution**: Independent steps run concurrently
- **Efficient Templating**: Lazy evaluation of templates
- **Minimal State**: Only store step results needed for templating

### Reliability

- **Automatic Retries**: Configurable per-step retry policies
- **Durable Execution**: Temporal ensures workflow completion
- **Failure Isolation**: Failed steps don't crash entire workflow

## Extension Points

### 1. Custom Activities

Add new activities in `src/activities.ts`:

```typescript
export const activities = {
  async myActivity(input: MyInput): Promise<MyOutput> {
    // Your logic here
  }
};
```

### 2. Custom Validation

Extend `loader.ts` to add custom validation rules.

### 3. Middleware

Add pre/post-processing hooks in the workflow runner.

### 4. Custom Templating

Replace Mustache with another templating engine.

## Security Considerations

1. **Input Validation**: Validate all workflow inputs
2. **Activity Isolation**: Activities should not trust workflow data
3. **Secrets Management**: Use environment variables or secret stores
4. **Access Control**: Implement authorization in activities
5. **Audit Logging**: Log all workflow executions

## Monitoring & Observability

### Temporal UI

- View workflow execution history
- Inspect step results and errors
- Replay workflows for debugging
- Monitor worker health

### Logging

- Workflow logs appear in Temporal UI
- Activity logs in worker output
- Structured logging with context

### Metrics

- Workflow duration
- Step execution times
- Retry counts
- Error rates

## Future Enhancements

1. **Workflow Composition**: Support sub-workflows
2. **Dynamic Workflows**: Generate workflows programmatically
3. **Parallel Groups**: Execute multiple steps in parallel explicitly
4. **Workflow Versioning**: Migrate running workflows to new versions
5. **Visual Editor**: Web-based workflow designer
6. **API Layer**: REST/GraphQL API for workflow management
