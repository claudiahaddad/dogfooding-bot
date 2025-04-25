import { LinearClient } from "@linear/sdk";
import { log } from "./helpers/utils.js";

let linearClient: LinearClient | null = null;

// Initialize the Linear client once
function getLinearClient(apiKey: string): LinearClient {
  if (!linearClient) {
    linearClient = new LinearClient({ apiKey });
    log("[INFO] Linear client initialized.");
  }
  return linearClient;
}

interface CreateTicketParams {
  apiKey: string;
  teamId: string;
  title: string;
  description: string;
  feedbackSenderAddress?: string; // Optional: To add context
}

export async function createLinearTicket({
  apiKey,
  teamId,
  title,
  description,
  feedbackSenderAddress,
}: CreateTicketParams): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const client = getLinearClient(apiKey);

    let fullDescription = description;
    if (feedbackSenderAddress) {
      fullDescription += `\n\n---\n*Feedback submitted via XMTP by: ${feedbackSenderAddress}*`;
    }

    log(`[INFO] Creating Linear ticket in team ${teamId} with title: ${title}`);

    const result = await client.createIssue({
      teamId: teamId,
      title: title,
      description: fullDescription,
      // You can add more fields like priority, labels, assigneeId etc. here
      // priority: 0, // Example: No priority
      // labelIds: ["some-label-uuid"], // Example
    });

    const issue = await result.issue;

    if (result.success && issue) {
      log(`[SUCCESS] Created Linear ticket: ${issue.url}`);
      return { success: true, url: issue.url };
    } else {
      log(`[ERROR] Linear API reported failure to create ticket.`);
      return { success: false, error: "Linear API reported failure." };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`[ERROR] Failed to create Linear ticket: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
} 