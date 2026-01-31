/**
 * Type of workflow step.
 * - 'activity': Execute a Temporal activity
 * - 'signal': Wait for an external signal
 * - 'code': Execute inline JavaScript code (like n8n)
 */
export type StepType = 'activity' | 'signal' | 'code';

/**
 * Definition of a single workflow step.
 * Steps form a DAG based on their dependencies.
 */
export interface StepDefinition {
  id: string;
  /**
   * Activity name to execute. Required for 'activity' type steps.
   * For 'code' type steps, this is optional (defaults to 'executeCode').
   */
  activity?: string;
  /**
   * Input data passed to the step. Available as `input` in code steps.
   */
  input?: Record<string, unknown>;
  /**
   * JavaScript code to execute. Required for 'code' type steps.
   * The code has access to:
   * - `input`: The resolved input object
   * - `context`: { inputs, steps } - workflow inputs and previous step results
   * - `require`: Limited module access (lodash, moment, etc.)
   * 
   * Must return a value which becomes the step's output.
   * 
   * @example
   * ```javascript
   * // Transform data
   * const result = input.items.map(item => ({
   *   ...item,
   *   processed: true,
   *   timestamp: new Date().toISOString()
   * }));
   * return { items: result, count: result.length };
   * ```
   */
  code?: string;
  dependsOn?: string[];
  /**
   * Optional type of step. Defaults to 'activity'.
   * - 'activity': normal activity execution
   * - 'signal': wait for an external signal to provide the result
   * - 'code': execute inline JavaScript code
   */
  type?: StepType;
  /**
   * Optional conditional expression. If provided and evaluates to falsy,
   * the step is skipped.
   */
  when?: string;
  /**
   * Optional per-step timeouts. Currently only start-to-close is used
   * when configuring the activity proxy.
   */
  timeout?: {
    startToClose?: string;
  };
  retry?: {
    /** Number of retries after the first attempt */
    count?: number;
    backoffCoefficient?: number;
    /** Base delay between retries (e.g. '1s', '5m') */
    initialInterval?: string;
    /**
     * Optional absolute maximum attempts (including the first attempt).
     * If set, this takes precedence over `count`.
     */
    maximumAttempts?: number;
  };
}

/**
 * Complete workflow definition loaded from YAML.
 */
export interface WorkflowDefinition {
  /** Unique workflow name */
  name: string;
  /** Semantic version (e.g., '1.0.0') */
  version: string;
  /** Optional workflow description */
  description?: string;
  /** Input schema definition */
  inputs?: Record<string, unknown>;
  /** Array of step definitions forming a DAG */
  steps: StepDefinition[];
}

/**
 * Result of a workflow step execution.
 */
export interface StepResult {
  /** Step identifier */
  id: string;
  /** Execution status */
  status: 'completed' | 'failed' | 'skipped';
  /** Activity output (if completed successfully) */
  output?: unknown;
  /** Error message (if failed or skipped) */
  error?: string;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Number of attempts made (including retries) */
  attempt?: number;
}

/**
 * Context available for Mustache templating in workflow steps.
 */
export interface WorkflowContext {
  /** Workflow input data */
  inputs: Record<string, unknown>;
  /** Results from completed steps */
  results: Record<string, StepResult>;
}

/**
 * Registry of activity functions available to workflows.
 */
export interface ActivityRegistration {
  [key: string]: (...args: unknown[]) => Promise<unknown>;
}
