import { Connection, WorkflowClient } from '@temporalio/client';
import { loadWorkflowDefinition, resolveWorkflowInputs } from '../src/loader.js';

async function main() {
  // Create a proper connection to Temporal
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });

  const client = new WorkflowClient({
    connection,
  });

  // Resolve path to the example DSL file
  const workflowFile = new URL('../dsl/example.workflow.yaml', import.meta.url).pathname;
  const workflowDef = await loadWorkflowDefinition(workflowFile);

  // Provide concrete inputs for the example workflow
  const inputs = resolveWorkflowInputs(workflowDef, {
    user: {
      name: 'Alice Example',
      email: 'alice@example.com',
      password: 's3cret-password',
    },
  });

  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'default';
  const workflowId = `user-registration-${Date.now()}`;

  const handle = await client.start('runWorkflow', {
    taskQueue,
    workflowId,
    args: [
      {
        steps: workflowDef.steps,
        inputs,
        taskQueue,
        workflowId,
      },
    ],
  });

  console.log(`Started workflow ${workflowId} (runId: ${handle.firstExecutionRunId})`);

  // Simulate some external decision before sending the approval signal
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Sending approval signal to workflow...');
  await handle.signal('step', 'approval', { approved: true });

  const result = await handle.result();
  console.log('Workflow completed. Final results:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Failed to run example workflow:', err);
  process.exit(1);
});
