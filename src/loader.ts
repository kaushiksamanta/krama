/**
 * YAML Workflow Loader
 * 
 * Loads and validates workflow definitions from YAML files.
 * Performs structural validation and DAG cycle detection.
 */

import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { WorkflowDefinition, StepDefinition } from './types.js';

/**
 * Loads a workflow definition from a YAML file.
 * 
 * @param filePath - Path to the YAML workflow definition file
 * @returns Parsed and validated workflow definition
 * @throws Error if file cannot be read or workflow is invalid
 */
export async function loadWorkflowDefinition(filePath: string): Promise<WorkflowDefinition> {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const workflow = parseYaml(fileContent) as WorkflowDefinition;
    
    // Validate the workflow structure
    if (!workflow.name) {
      throw new Error('Workflow definition must include a name');
    }
    
    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error('Workflow must contain at least one step');
    }

    // Validate step graph (duplicates, undefined deps, cycles)
    validateWorkflowSteps(workflow.steps);

    // Set default version if not specified
    if (!workflow.version) {
      workflow.version = '1.0.0';
    }
    
    // Validate each step has an id
    for (const step of workflow.steps) {
      if (!step.id) {
        throw new Error('All steps must have an id');
      }
    }
    
    return workflow;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load workflow from ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

export function validateWorkflowSteps(steps: StepDefinition[]): void {
  const stepIds = new Set<string>();
  const dependencies = new Map<string, string[]>();
  
  // First pass: collect all step IDs, validate step structure, and collect dependencies
  for (const step of steps) {
    if (stepIds.has(step.id)) {
      throw new Error(`Duplicate step ID: ${step.id}`);
    }
    stepIds.add(step.id);
    
    // Validate based on step type
    const stepType = step.type || 'activity';
    
    if (stepType === 'code') {
      // Code steps require a 'code' field
      if (!step.code) {
        throw new Error(`Step '${step.id}' is of type 'code' but missing required 'code' field`);
      }
    } else if (stepType === 'activity') {
      // Activity steps require an 'activity' field
      if (!step.activity) {
        throw new Error(`Step '${step.id}' is missing required 'activity' field`);
      }
    }
    // Signal steps don't require activity or code
    
    if (step.dependsOn) {
      dependencies.set(step.id, step.dependsOn);
    }
  }
  
  // Second pass: validate all dependencies exist
  for (const [stepId, deps] of dependencies.entries()) {
    for (const depId of deps) {
      if (!stepIds.has(depId)) {
        throw new Error(`Step '${stepId}' depends on undefined step '${depId}'`);
      }
    }
  }
  
  // Third pass: check for cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function visit(stepId: string) {
    if (recursionStack.has(stepId)) {
      throw new Error(`Cycle detected in workflow steps involving step '${stepId}'`);
    }
    
    if (visited.has(stepId)) {
      return;
    }
    
    visited.add(stepId);
    recursionStack.add(stepId);
    
    for (const depId of dependencies.get(stepId) || []) {
      visit(depId);
    }
    
    recursionStack.delete(stepId);
  }
  
  for (const stepId of stepIds) {
    visit(stepId);
  }
}

export function resolveWorkflowInputs(
  workflow: WorkflowDefinition, 
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  // Start with default inputs from workflow definition
  const inputs = { ...(workflow.inputs || {}) };
  
  // Apply overrides
  for (const [key, value] of Object.entries(overrides)) {
    inputs[key] = value;
  }
  
  return inputs;
}
