/**
 * Workflow Execution Module
 * 
 * Provides a structured, object-oriented approach to executing YAML-defined
 * workflows as Directed Acyclic Graphs (DAGs).
 */

import { WorkflowExecutor, cancelSignal, stepSignal } from './WorkflowExecutor.js';
import type { ExecutorWorkflowDefinition, StepResult } from '../types/index.js';

/**
 * Main workflow function that executes a DAG-based workflow.
 * 
 * @param definition - Workflow definition containing steps, inputs, and metadata
 * @returns Record of step results keyed by step ID
 */
export async function runWorkflow(definition: ExecutorWorkflowDefinition): Promise<Record<string, StepResult>> {
  const executor = new WorkflowExecutor(definition);
  return executor.execute();
}

// Re-export signals for external use
export { cancelSignal, stepSignal };

// Re-export types
export type { ExecutorWorkflowDefinition as WorkflowDefinition, StepResult, ExecutorNodeContext as NodeContext, TemplateContext } from '../types/index.js';

// Re-export classes for testing/extension
export { WorkflowExecutor } from './WorkflowExecutor.js';
export { StepExecutor } from './StepExecutor.js';
