/**
 * Temporal Workflow Runner
 * 
 * Executes YAML-defined workflows as Directed Acyclic Graphs (DAGs) with support for:
 * - Conditional execution
 * - Signal-based steps for external events
 * - Per-step timeouts and retry policies
 * - Mustache templating for dynamic inputs
 * - Automatic dependency resolution and parallel execution
 */

import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';
import { WorkflowDAG } from './toposort.js';
import { StepDefinition, WorkflowContext, StepResult } from './types.js';
import Mustache from 'mustache';

/**
 * Signal to cancel workflow execution.
 * Usage: await handle.signal('cancel');
 */
export const cancelSignal = defineSignal('cancel');

/**
 * Signal to deliver payloads to signal-type steps.
 * Usage: await handle.signal('step', stepId, payload);
 */
export const stepSignal = defineSignal<[stepId: string, payload: unknown]>('step');

/**
 * Main workflow function that executes a DAG-based workflow.
 * 
 * @param definition - Workflow definition containing steps, inputs, and metadata
 * @param definition.steps - Array of step definitions forming a DAG
 * @param definition.inputs - Input data available to all steps via templating
 * @param definition.taskQueue - Temporal task queue name
 * @param definition.workflowId - Unique workflow identifier
 * @returns Record of step results keyed by step ID
 */
export async function runWorkflow(definition: {
  steps: StepDefinition[];
  inputs?: Record<string, unknown>;
  taskQueue: string;
  workflowId: string;
  workflowName?: string;
}): Promise<Record<string, StepResult>> {
  const { steps, inputs = {}, taskQueue, workflowId, workflowName = 'Workflow' } = definition;

  // Store results of each step
  const results: Record<string, StepResult> = {};
  
  // Create workflow context for templating
  const context: WorkflowContext = {
    inputs,
    results: {},
  };

  // Validate and sort the workflow steps
  const dag = new WorkflowDAG(steps);
  const executionOrder = dag.getExecutionOrder();

  // Set up cancellation & signal handlers
  let isCancelled = false;
  const signalResults: Record<string, unknown> = {};

  setHandler(cancelSignal, () => {
    isCancelled = true;
  });

  setHandler(stepSignal, (stepId: string, payload: unknown) => {
    signalResults[stepId] = payload;
  });

  // Execute steps in topological order
  for (const stepId of executionOrder) {
    if (isCancelled) {
      break;
    }

    const step = dag.getStep(stepId);
    if (!step) continue;

    const stepResult: StepResult = {
      id: stepId,
      status: 'completed',
      attempt: 0,
    };

    try {
      // Check if any dependencies failed or were skipped
      const dependencies = dag.getDependencies(stepId);
      const failedOrSkippedDep = Array.from(dependencies).find(
        depId => {
          const depStatus = context.results[depId]?.status;
          return depStatus === 'failed' || depStatus === 'skipped';
        }
      );

      if (failedOrSkippedDep) {
        const depStatus = context.results[failedOrSkippedDep]?.status;
        stepResult.status = 'skipped';
        stepResult.error = `Skipped due to ${depStatus} dependency: ${failedOrSkippedDep}`;
        results[stepId] = stepResult;
        context.results[stepId] = stepResult;
        continue;
      }

      // Prepare templating context
      const templateContext = {
        inputs: context.inputs,
        step: {
          ...Object.entries(context.results).reduce((acc, [id, result]) => ({
            ...acc,
            [id]: { result: result.output }
          }), {})
        }
      };

      // Evaluate conditional 'when' expression, if present
      if (step.when) {
        const rendered = Mustache.render(step.when, templateContext).trim();
        const isTruthy = rendered !== '' && rendered !== 'false' && rendered !== '0';
        if (!isTruthy) {
          stepResult.status = 'skipped';
          stepResult.error = `Skipped due to unmet condition: ${step.when}`;
          results[stepId] = stepResult;
          context.results[stepId] = stepResult;
          continue;
        }
      }

      // Prepare activity input with templating
      let activityInput = {};
      if (step.input) {
        const templateContext = {
          inputs: context.inputs,
          step: {
            ...Object.entries(context.results).reduce((acc, [id, result]) => ({
              ...acc,
              [id]: { result: result.output }
            }), {})
          }
        };
        
        // Recursively render templates in the input
        const renderValue = (value: unknown): unknown => {
          if (typeof value === 'string') {
            // Check if the entire string is a single mustache tag like {{inputs.user}}
            const singleTagMatch = value.match(/^\{\{([^}]+)\}\}$/);
            if (singleTagMatch) {
              // Resolve the path directly to preserve object types
              const pathStr = singleTagMatch[1].trim();
              const parts = pathStr.split('.');
              let result: unknown = templateContext;
              for (const part of parts) {
                if (result && typeof result === 'object') {
                  result = (result as Record<string, unknown>)[part];
                } else {
                  result = undefined;
                }
              }
              return result;
            }
            // Otherwise render as a string template
            return Mustache.render(value, templateContext);
          } else if (Array.isArray(value)) {
            return value.map(renderValue);
          } else if (value && typeof value === 'object') {
            return Object.entries(value as Record<string, unknown>).reduce((acc, [k, v]) => ({
              ...acc,
              [k]: renderValue(v)
            }), {} as Record<string, unknown>);
          }
          return value;
        };
        
        activityInput = renderValue(step.input) as Record<string, unknown>;
      }

      // Handle signal-type steps (no activity invocation)
      if (step.type === 'signal') {
        // Wait until a signal for this step arrives or the workflow is cancelled
        await condition(() => isCancelled || stepId in signalResults);

        if (isCancelled && !(stepId in signalResults)) {
          stepResult.status = 'skipped';
          stepResult.error = 'Skipped because workflow was cancelled before signal was received';
        } else {
          stepResult.output = signalResults[stepId];
        }

        results[stepId] = stepResult;
        context.results[stepId] = stepResult;
        continue;
      }

      // Handle code-type steps (execute JavaScript code via code node)
      if (step.type === 'code') {
        if (!step.code) {
          throw new Error(`Step '${stepId}' is of type 'code' but missing 'code' field`);
        }

        // Build NodeContext for code execution
        const nodeContext = {
          workflowInputs: { ...context.inputs, __stepInput__: activityInput },
          stepResults: Object.entries(context.results).reduce((acc, [id, result]) => ({
            ...acc,
            [id]: result.output
          }), {} as Record<string, unknown>),
          workflow: { id: workflowId, name: workflowName },
          step: { id: stepId, attempt: 1 },
        };

        // Create proxy with Temporal's built-in retry policy
        const stepProxy = proxyActivities<Record<string, (input: unknown) => Promise<unknown>>>({
          startToCloseTimeout: step.timeout?.startToClose ?? '1 hour',
          taskQueue,
          retry: {
            initialInterval: step.retry?.initialInterval ?? '1s',
            backoffCoefficient: step.retry?.backoffCoefficient ?? 2.0,
            maximumAttempts: step.retry?.maximumAttempts ?? 
              (step.retry?.count !== undefined ? step.retry.count + 1 : 2),
            maximumInterval: '5 minutes',
          },
        });

        // Use the code node activity - Temporal handles retries
        const codeResult = await stepProxy.code({
          input: {
            code: step.code,
            timeout: step.timeout?.startToClose ? parseDurationToMs(step.timeout.startToClose) : 30000,
          },
          context: nodeContext,
        }) as { result: { result: unknown; logs: string[]; executionTime: number }; logs: string[]; executionTime: number };

        stepResult.output = codeResult.result.result;
        results[stepId] = stepResult;
        context.results[stepId] = stepResult;
        continue;
      }

      // Validate activity name exists in worker registration (proxy throws at run if missing)
      const activityName = step.activity;
      if (!activityName || typeof activityName !== 'string') {
        throw new Error(`Invalid activity name for step '${stepId}'`);
      }

      // Build NodeContext for activities
      const nodeContext = {
        workflowInputs: context.inputs,
        stepResults: Object.entries(context.results).reduce((acc, [id, result]) => ({
          ...acc,
          [id]: result.output
        }), {} as Record<string, unknown>),
        workflow: { id: workflowId, name: workflowName },
        step: { id: stepId, attempt: 1 },
      };

      // Create proxy with Temporal's built-in retry policy
      const stepProxy = proxyActivities<Record<string, (input: unknown) => Promise<unknown>>>({
        startToCloseTimeout: step.timeout?.startToClose ?? '1 hour',
        taskQueue,
        retry: {
          initialInterval: step.retry?.initialInterval ?? '1s',
          backoffCoefficient: step.retry?.backoffCoefficient ?? 2.0,
          maximumAttempts: step.retry?.maximumAttempts ?? 
            (step.retry?.count !== undefined ? step.retry.count + 1 : 2),
          maximumInterval: '5 minutes',
        },
      });

      // All activities are node-based - Temporal handles retries
      const nodeResult = await stepProxy[activityName]({
        input: activityInput,
        context: nodeContext,
      }) as { result: unknown; logs: string[]; executionTime: number };
      
      stepResult.output = nodeResult.result;
    } catch (error) {
      stepResult.status = 'failed';
      stepResult.error = error instanceof Error ? error.message : String(error);
    } finally {
      results[stepId] = stepResult;
      context.results[stepId] = stepResult;
    }
  }

  return results;
}

// Helper function to parse duration strings like '5s', '1m', '2h' to milliseconds
function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smh])?$/);
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'ms';
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return value;
  }
}
