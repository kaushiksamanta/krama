import { z } from 'zod';
import { NodeDefinition, NodeContext } from '../types/node.js';

// ============================================================
// Email Node v1
// ============================================================

// Reusable email recipient schema (string or array of strings)
const EmailRecipient = z.union([
  z.string().email(),
  z.array(z.string().email()).min(1),
]);

// Attachment schema
const AttachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string(), // Base64 encoded
  contentType: z.string().optional(),
});

// Define input schema with Zod
const EmailInputSchema = z.object({
  to: EmailRecipient,
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  from: z.string().email().optional(),
  cc: EmailRecipient.optional(),
  bcc: EmailRecipient.optional(),
  replyTo: z.string().email().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

// Infer TypeScript type from schema
type EmailInput = z.infer<typeof EmailInputSchema>;

// Define output schema with Zod
const EmailOutputSchema = z.object({
  messageId: z.string(),
  status: z.enum(['sent', 'queued', 'simulated']),
});

type EmailOutput = z.infer<typeof EmailOutputSchema>;

const emailNode: NodeDefinition<EmailInput, EmailOutput> = {
  name: 'email',
  description: 'Send emails via configurable transport',
  version: '1.0.0',
  inputSchema: EmailInputSchema,
  outputSchema: EmailOutputSchema,
  retryPolicy: {
    maxAttempts: 2,
    initialInterval: 1000,
    nonRetryableErrorTypes: ['VALIDATION_ERROR', 'PERMISSION_ERROR'],
  },

  async execute(input: EmailInput, context: NodeContext): Promise<EmailOutput> {
    const { to, subject, body, from, cc, bcc, replyTo, attachments } = input;
    const { logger } = context;

    // Check for SMTP configuration
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    // Normalize recipients to arrays
    const toList = Array.isArray(to) ? to : [to];
    const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

    logger.info(`Sending email to: ${toList.join(', ')}`);
    logger.info(`Subject: ${subject}`);

    // If SMTP is not configured, simulate sending
    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.warn('SMTP not configured. Simulating email send.');
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const messageId = `simulated_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      // Log the email details for debugging
      console.log('=== SIMULATED EMAIL ===');
      console.log(`From: ${from || 'noreply@workflow-engine.local'}`);
      console.log(`To: ${toList.join(', ')}`);
      if (ccList.length > 0) console.log(`CC: ${ccList.join(', ')}`);
      if (bccList.length > 0) console.log(`BCC: ${bccList.join(', ')}`);
      if (replyTo) console.log(`Reply-To: ${replyTo}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${body}`);
      if (attachments && attachments.length > 0) {
        console.log(`Attachments: ${attachments.map(a => a.filename).join(', ')}`);
      }
      console.log('=== END EMAIL ===');

      return {
        messageId,
        status: 'simulated',
      };
    }

    // Production implementation would use nodemailer or similar
    // For now, simulate sending since actual SMTP is not yet implemented
    // TODO: Implement actual SMTP sending with nodemailer
    // const transporter = nodemailer.createTransport({
    //   host: smtpHost,
    //   port: parseInt(process.env.SMTP_PORT || '587'),
    //   secure: process.env.SMTP_SECURE === 'true',
    //   auth: { user: smtpUser, pass: smtpPass },
    // });
    //
    // const info = await transporter.sendMail({
    //   from: from || smtpUser,
    //   to: toList,
    //   cc: ccList,
    //   bcc: bccList,
    //   replyTo,
    //   subject,
    //   html: body,
    //   attachments: attachments?.map(a => ({
    //     filename: a.filename,
    //     content: Buffer.from(a.content, 'base64'),
    //     contentType: a.contentType,
    //   })),
    // });

    logger.warn('SMTP configured but actual sending not yet implemented. Simulating email send.');
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    const messageId = `simulated_smtp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Log the email details for debugging
    console.log('=== SIMULATED EMAIL (SMTP configured) ===');
    console.log(`From: ${from || smtpUser}`);
    console.log(`To: ${toList.join(', ')}`);
    if (ccList.length > 0) console.log(`CC: ${ccList.join(', ')}`);
    if (bccList.length > 0) console.log(`BCC: ${bccList.join(', ')}`);
    if (replyTo) console.log(`Reply-To: ${replyTo}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    if (attachments && attachments.length > 0) {
      console.log(`Attachments: ${attachments.map(a => a.filename).join(', ')}`);
    }
    console.log('=== END EMAIL ===');

    return {
      messageId,
      status: 'simulated',
    };
  },
};

export default emailNode;
