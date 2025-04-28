import { Client, DecodedMessage, Group } from "@xmtp/node-sdk";
import { isSameString, log } from "./helpers/utils.js";
import { createLinearTicket } from "./linear.js";

interface ListenOptions {
  adminAddress: string;
  linearApiKey: string;
  linearTeamId: string;
  linearCommand: string;
}

export async function listenForMessages(
  client: Client,
  dogfoodingGroup: Group,
  options: ListenOptions
) {
  const { adminAddress, linearApiKey, linearTeamId, linearCommand } = options;

  log(`[INFO] Streaming messages in group ${dogfoodingGroup.id}`);
  log(`[INFO] Listening for Linear command: "${linearCommand}" for team ID: ${linearTeamId}`);

  const stream = await client.conversations.streamAllMessages();

  for await (const message of stream) {
    log(`[DEBUG] Message received from: ${message?.senderInboxId}`);
    log(`[DEBUG] Client inbox ID: ${client.inboxId}`);
    log(`[DEBUG] Message content type: ${message?.contentType?.typeId}`);

    if (shouldSkip(message, client, dogfoodingGroup, linearCommand)) {
      log(
        `[DEBUG] Skipping message ${message?.id} based on skip conditions.`
      );
      continue;
    }

    let conversation: Awaited<ReturnType<typeof client.conversations.getConversationById>> | null = null;

    try {
      const content = message?.content?.toString() ?? "";
      const senderInboxId = message?.senderInboxId ?? "";
      const senderAddress = (message as any)?.senderAddress ?? "unknown";

      log(`[DEBUG] Processing message ${message?.id} from senderInboxId: ${senderInboxId}, senderAddress: ${senderAddress}`);
      log(`[DEBUG] Message content: "${content}"`);

      conversation = await client.conversations.getConversationById(
        message?.conversationId ?? ""
      );

      if (!conversation) {
        log(`[ERROR] Could not find the conversation for message ${message?.id}`);
        continue;
      }

      if (content.startsWith(`${linearCommand} `)) {
        const ticketDetails = content.substring(`${linearCommand} `.length);
        const [title, ...descriptionParts] = ticketDetails.split("\n");
        const description = descriptionParts.join("\n").trim();

        if (!title) {
          await conversation.send("Please provide a title for the Linear ticket after the command.");
          continue;
        }

        log(`[INFO] Creating Linear ticket for team ${linearTeamId}: "${title}" (Triggered by: ${senderAddress} in conv: ${conversation.id})`);
        try {
          const issueResult = await createLinearTicket({
            apiKey: linearApiKey,
            teamId: linearTeamId,
            title: title,
            description: description,
            feedbackSenderAddress: senderAddress,
          });
          if (issueResult?.success && issueResult.issue?.url) {
            await conversation.send(
              `✅ Ticket created: ${issueResult.issue.title} (${issueResult.issue.identifier})\n${issueResult.issue.url}`,
            );
          } else {
            await conversation.send(
              `❌ Failed to create ticket due to a problem connecting to Linear. Try again later.`,
            );
          }
        } catch (linearError: any) {
          log(`[ERROR] Failed to create Linear ticket: ${linearError.message}`);
          await conversation.send(
            `❌ An unexpected error occurred while creating the ticket.`,
          );
        }
        continue;
      }

      if (!(conversation instanceof Group)) {
        const members = await dogfoodingGroup.members();
        const isMember = members.some((member: { inboxId: string }) =>
          isSameString(member.inboxId, senderInboxId)
        );

        if (!isMember) {
          log(`Adding new member ${senderInboxId} via DM to Dogfooding group...`);
          await dogfoodingGroup.addMembers([senderInboxId]);

          await conversation.send(
            `I've added you to the Dogfooding group. Check your requests to find it! You can also message me feedback directly using the /linear command and I'll make a ticket.`
          );

          log(`Added ${senderInboxId} to Dogfooding group`);
        } else {
          log(`User ${senderInboxId} (DM) is already a member of the Dogfooding group`);
          await conversation.send(`You're already a member of the Dogfooding group!`);
        }
      } else {
        log(`[DEBUG] Ignoring non-command message ${message?.id} in group conversation ${conversation.id}`);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log(`Error processing message: ${errorMessage}`);

      try {
        if (conversation) {
          await conversation.send(
            "Sorry, I encountered an error processing your message."
          );
        } else {
          log(`[WARN] Could not send error message back because conversation object was not available for message ${message?.id}`);
        }
      } catch (sendError) {
        log(
          `Failed to send error message: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`
        );
      }
    }
  }
}

function shouldSkip(
  message: DecodedMessage<any> | undefined,
  client: Client,
  dogfoodingGroup: Group,
  linearCommand: string
) {
  if (isSameString(message?.senderInboxId, client.inboxId)) {
    log(`[DEBUG] Skipping message ${message?.id}: Sent by self.`);
    return true;
  }

  if (message?.contentType?.typeId !== "text") {
    log(`[DEBUG] Skipping message ${message?.id}: Non-text content type (${message?.contentType?.typeId}).`);
    return true;
  }

  log(`[DEBUG] Not skipping message ${message?.id}.`);
  return false;
}