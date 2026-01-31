/**
 * Centralized type exports for the workflow engine.
 * 
 * This module consolidates all types into a single import location:
 * - Core types: Step definitions, results, workflow context
 * - Node types: Node definitions, execution context, errors
 * - Workflow types: Executor definitions, template context
 */

// Core workflow types
export type {
  StepType,
  StepDefinition,
  WorkflowDefinition,
  StepResult,
  WorkflowContext,
  ActivityRegistration,
} from './core.js';

// Node plugin types
export type {
  NodeLogger,
  NodeContextData,
  NodeContext,
  NodeDefinitionMeta,
  RetryPolicy,
  NodeDefinition,
  NodeExecutionResult,
  NodeErrorCode,
} from './node.js';

export {
  WorkflowMetaSchema,
  StepMetaSchema,
  NodeContextSchema,
  NodeDefinitionMetaSchema,
  NodeExecutionResultSchema,
  NodeExecutionError,
} from './node.js';

// Workflow executor types
export type {
  ExecutorWorkflowDefinition,
  ExecutorNodeContext,
  TemplateContext,
  NodeActivityResult,
  CodeNodeResult,
} from './workflow.js';
