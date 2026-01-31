import { Worker, NativeConnection } from '@temporalio/worker';
import { WorkflowClient } from '@temporalio/client';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadNodes, createNodeActivities } from './nodes/index.js';
import { loadWorkflowDefinition } from './loader.js';

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the workflow interface
export interface WorkflowInput {
  workflowId: string;
  taskQueue: string;
  workflowFile: string;
  inputs?: Record<string, unknown>;
}

/**
 * Start a new workflow execution
 */
export async function startWorkflow(options: WorkflowInput) {
  const { workflowId, taskQueue, workflowFile, inputs = {} } = options;
  
  // Load and validate the workflow definition
  const workflowPath = path.isAbsolute(workflowFile) 
    ? workflowFile 
    : path.resolve(process.cwd(), workflowFile);
  
  const workflowDef = await loadWorkflowDefinition(workflowPath);
  
  // Create a client to communicate with the Temporal server
  const temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const connection = await NativeConnection.connect({
    address: temporalAddress,
  });
  
  const client = new WorkflowClient({
    connection,
  });
  
  // Start the workflow
  const handle = await client.start('runWorkflow', {
    taskQueue,
    workflowId,
    args: [{
      steps: workflowDef.steps,
      inputs: { ...(workflowDef.inputs || {}), ...inputs },
      taskQueue,
      workflowId,
      workflowName: workflowDef.name,
    }],
  });
  
  console.log(`Started workflow ${workflowId} with run ID ${handle.firstExecutionRunId}`);
  
  // Wait for workflow completion
  try {
    const result = await handle.result();
    console.log('Workflow completed successfully');
    console.log('Results:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Workflow failed:', error);
    throw error;
  } finally {
    await connection.close();
  }
}

/**
 * Start a worker to process workflow and activity tasks
 */
export async function startWorker(taskQueue: string = 'default') {
  // Load and register all nodes from the nodes directory
  const nodesDir = path.join(__dirname, 'nodes');
  await loadNodes(nodesDir);
  console.log('All nodes loaded and registered');

  // Create Temporal activities from registered nodes
  const nodeActivities = createNodeActivities();
  console.log('Node activities created:', Object.keys(nodeActivities));

  // Register workflows and activities
  const temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const worker = await Worker.create({
    connection: await NativeConnection.connect({ address: temporalAddress }),
    taskQueue,
    // When using tsx in development, point directly at the TypeScript workflow file
    workflowsPath: new URL('./workflow.ts', import.meta.url).pathname,
    activities: nodeActivities,
  });
  
  console.log(`Worker started on task queue: ${taskQueue}`);
  await worker.run();
}

// Handle command line execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  
  if (command === 'start-worker') {
    const taskQueue = process.argv[3] || 'default';
    startWorker(taskQueue).catch(err => {
      console.error('Worker failed to start:', err);
      process.exit(1);
    });
  } 
  else if (command === 'start-workflow') {
    const workflowFile = process.argv[3];
    const workflowId = process.argv[4] || `workflow-${Date.now()}`;
    const taskQueue = process.argv[5] || 'default';
    
    if (!workflowFile) {
      console.error('Usage: start-workflow <workflow-file> [workflow-id] [task-queue]');
      process.exit(1);
    }
    
    startWorkflow({
      workflowFile,
      workflowId,
      taskQueue,
    }).catch(err => {
      console.error('Workflow failed:', err);
      process.exit(1);
    });
  }
  else {
    console.log('Available commands:');
    console.log('  start-worker [task-queue] - Start a worker process');
    console.log('  start-workflow <workflow-file> [workflow-id] [task-queue] - Start a new workflow');
    process.exit(1);
  }
}
