/**
 * Node plugin architecture types - definitions, context, and execution.
 */

import { z } from 'zod';

/**
 * Logger interface available to nodes.
 */
export interface NodeLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Zod schema for workflow metadata.
 */
export const WorkflowMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * Zod schema for step metadata.
 */
export const StepMetaSchema = z.object({
  id: z.string(),
  attempt: z.number().int().min(1),
});

/**
 * Zod schema for NodeContext (serializable parts only).
 * Used for validation when passing context between boundaries.
 */
export const NodeContextSchema = z.object({
  workflowInputs: z.record(z.string(), z.unknown()),
  stepResults: z.record(z.string(), z.unknown()),
  workflow: WorkflowMetaSchema,
  step: StepMetaSchema,
});

/** Inferred type from NodeContextSchema */
export type NodeContextData = z.infer<typeof NodeContextSchema>;

/** Full NodeContext including non-serializable logger */
export interface NodeContext extends NodeContextData {
  logger: NodeLogger;
}

/**
 * Zod schema for NodeDefinition metadata.
 */
export const NodeDefinitionMetaSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase with hyphens'),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver format (e.g., 1.0.0)'),
});

/** Inferred type from NodeDefinitionMetaSchema */
export type NodeDefinitionMeta = z.infer<typeof NodeDefinitionMetaSchema>;

/**
 * Retry policy configuration for nodes.
 */
export interface RetryPolicy {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial retry interval in ms (default: 1000) */
  initialInterval?: number;
  /** Maximum retry interval in ms (default: 30000) */
  maximumInterval?: number;
  /** Backoff coefficient (default: 2) */
  backoffCoefficient?: number;
  /** Non-retryable error types */
  nonRetryableErrorTypes?: NodeErrorCode[];
}

/**
 * Full NodeDefinition interface including schemas and execute function.
 * Note: The execute function and Zod schemas themselves can't be Zod-validated,
 * so this remains a TypeScript interface that extends the validated metadata.
 */
export interface NodeDefinition<TInput = unknown, TOutput = unknown> extends NodeDefinitionMeta {
  /** Zod schema for input validation */
  inputSchema?: z.ZodType<TInput>;
  
  /** Zod schema for output documentation */
  outputSchema?: z.ZodType<TOutput>;
  
  /** Default retry policy for this node */
  retryPolicy?: RetryPolicy;
  
  /** The main execution function */
  execute(input: TInput, context: NodeContext): Promise<TOutput>;
}

/**
 * Zod schema factory for node execution result.
 */
export const NodeExecutionResultSchema = <T extends z.ZodType>(outputSchema: T) =>
  z.object({
    success: z.boolean(),
    output: outputSchema.optional(),
    error: z.string().optional(),
    logs: z.array(z.string()),
    executionTime: z.number().min(0),
  });

/** Generic type for execution result */
export type NodeExecutionResult<T = unknown> = {
  success: boolean;
  output?: T;
  error?: string;
  logs: string[];
  executionTime: number;
};

export type NodeErrorCode = 
  | 'VALIDATION_ERROR'
  | 'EXECUTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'PERMISSION_ERROR';

export class NodeExecutionError extends Error {
  constructor(
    public readonly nodeName: string,
    message: string,
    public readonly code: NodeErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(`[${nodeName}] ${message}`);
    this.name = 'NodeExecutionError';
  }
}
