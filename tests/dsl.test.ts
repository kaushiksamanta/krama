import { describe, it, expect } from 'vitest';
import { loadWorkflowDefinition } from '../src/loader.js';
import type { WorkflowDefinition } from '../src/types.js';

const dslPath = new URL('../dsl/example.workflow.yaml', import.meta.url).pathname;

describe('DSL: example.workflow.yaml', () => {
  it('loads and validates with extended fields (when, timeout, signal)', async () => {
    const def: WorkflowDefinition = await loadWorkflowDefinition(dslPath);

    expect(def.name).toBe('user-registration');
    expect(def.steps.length).toBeGreaterThanOrEqual(5);

    const sendWelcome = def.steps.find(s => s.id === 'send_welcome_email');
    const signalStep = def.steps.find(s => s.id === 'await_profile_completion');
    const followup = def.steps.find(s => s.id === 'send_followup_email');

    expect(sendWelcome).toBeDefined();
    expect(sendWelcome?.when).toContain('create_user');
    expect(sendWelcome?.activity).toBe('email');

    expect(signalStep).toBeDefined();
    expect(signalStep?.type).toBe('signal');

    expect(followup).toBeDefined();
    expect(followup?.dependsOn).toContain('await_profile_completion');
    expect(followup?.when).toContain('profileCompleted');
  });
});
