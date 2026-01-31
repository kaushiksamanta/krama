/**
 * Workflow execution types - executor definitions and runtime context.
 */

import type { StepDefinition, StepResult, WorkflowContext } from './core.js';
import type { NodeContextData } from './node.js';

/**
 * Workflow definition passed to the executor.
 */
export interface ExecutorWorkflowDefinition {
  steps: StepDefinition[];
  inputs?: Record<string, unknown>;
  taskQueue: string;
  workflowId: string;
  workflowName?: string;
}

/**
 * Node context passed to activities (without logger, which is added by the activity wrapper).
 * Re-uses NodeContextData from node types for consistency.
 */
export type ExecutorNodeContext = NodeContextData;

/**
 * Template context for Mustache rendering.
 */
export interface TemplateContext {
  inputs: Record<string, unknown>;
  step: Record<string, { result: unknown }>;
}

/**
 * Result from a node activity execution.
 */
export interface NodeActivityResult {
  result: unknown;
  logs: string[];
  executionTime: number;
}

/**
 * Result from a code node execution.
 */
export interface CodeNodeResult {
  result: {
    result: unknown;
    logs: string[];
    executionTime: number;
  };
  logs: string[];
  executionTime: number;
}

export type { StepDefinition, StepResult, WorkflowContext };
