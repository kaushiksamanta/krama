/**
 * Temporal Workflow Runner
 * 
 * Re-exports the workflow execution module with a structured, object-oriented design.
 * 
 * Features:
 * - Conditional execution
 * - Signal-based steps for external events
 * - Per-step timeouts and retry policies
 * - Mustache templating for dynamic inputs
 * - Automatic dependency resolution and parallel execution
 */

export { runWorkflow, cancelSignal, stepSignal } from './workflow/index.js';
export type { WorkflowDefinition, StepResult, NodeContext } from './workflow/index.js';
export { WorkflowExecutor, StepExecutor } from './workflow/index.js';
