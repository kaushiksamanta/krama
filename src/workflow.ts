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

import { proxyActivities, defineSignal, setHandler, sleep, condition } from '@temporalio/workflow';
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
export const stepSignal = defineSignal<[stepId: string, payload: any]>('step');

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
  inputs?: Record<string, any>;
  taskQueue: string;
  workflowId: string;
}): Promise<Record<string, StepResult>> {
  const { steps, inputs = {}, taskQueue, workflowId } = definition;

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
  const signalResults: Record<string, any> = {};

  setHandler(cancelSignal, () => {
    isCancelled = true;
  });

  setHandler(stepSignal, (stepId: string, payload: any) => {
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
        const renderValue = (value: any): any => {
          if (typeof value === 'string') {
            // Check if the entire string is a single mustache tag like {{inputs.user}}
            const singleTagMatch = value.match(/^\{\{([^}]+)\}\}$/);
            if (singleTagMatch) {
              // Resolve the path directly to preserve object types
              const path = singleTagMatch[1].trim();
              const parts = path.split('.');
              let result: any = templateContext;
              for (const part of parts) {
                result = result?.[part];
              }
              return result;
            }
            // Otherwise render as a string template
            return Mustache.render(value, templateContext);
          } else if (Array.isArray(value)) {
            return value.map(renderValue);
          } else if (value && typeof value === 'object') {
            return Object.entries(value).reduce((acc, [k, v]) => ({
              ...acc,
              [k]: renderValue(v)
            }), {});
          }
          return value;
        };
        
        activityInput = renderValue(step.input);
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

      // Configure retry policy
      const baseInitialInterval = step.retry?.initialInterval ?? '1s';
      const baseBackoff = step.retry?.backoffCoefficient ?? 2.0;
      const maximumAttempts =
        step.retry?.maximumAttempts ??
        (step.retry?.count !== undefined ? step.retry.count + 1 : 2);

      const retryPolicy = {
        initialInterval: baseInitialInterval,
        backoffCoefficient: baseBackoff,
        maximumAttempts,
      };

      // Validate activity name exists in worker registration (proxy throws at run if missing)
      const activityName = step.activity;
      if (!activityName || typeof activityName !== 'string') {
        throw new Error(`Invalid activity name for step '${stepId}'`);
      }

      // Execute with retry logic
      let lastError: Error | undefined;
      for (let attempt = 1; attempt <= retryPolicy.maximumAttempts; attempt++) {
        try {
          // Create a proxy for this step to honor per-step timeout
          const stepProxy = proxyActivities<Record<string, (input: any) => Promise<any>>>(
            {
              startToCloseTimeout: step.timeout?.startToClose ?? '1 hour',
              taskQueue,
            }
          );

          stepResult.attempt = attempt;
          const result = await stepProxy[activityName](activityInput);
          stepResult.output = result;
          break;
        } catch (error) {
          lastError = error as Error;
          if (attempt < retryPolicy.maximumAttempts) {
            const delayMs = Math.min(
              retryPolicy.initialInterval ? 
                parseDurationToMs(retryPolicy.initialInterval) * Math.pow(retryPolicy.backoffCoefficient, attempt - 1) :
                1000 * Math.pow(2, attempt - 1),
              5 * 60 * 1000 // Max 5 minutes
            );
            await sleep(delayMs);
          } else {
            throw lastError;
          }
        }
      }
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
