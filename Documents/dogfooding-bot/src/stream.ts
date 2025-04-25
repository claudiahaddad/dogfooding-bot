import { Client, DecodedMessage, type Group } from "@xmtp/node-sdk";
import { isSameString, log } from "./helpers/utils.js";
import { createLinearTicket } from "./linear.js";

interface ListenerConfig {
  adminAddress: string;
  linearApiKey: string;
  linearTeamId: string;
  linearCommand: string;
}

export async function listenForMessages(
  client: Client,
  dogfoodingGroup: Group,
  config: ListenerConfig
) {
  const stream = await client.conversations.streamAllMessages();

  for await (const message of stream) {
    log(`[DEBUG] Message received from: ${message?.senderInboxId}`);
    log(`[DEBUG] Client inbox ID: ${client.inboxId}`);
    log(`[DEBUG] Message content type: ${message?.contentType?.typeId}`);
    log(`[DEBUG] Conversation ID: ${message?.conversationId}`);
    log(`[DEBUG] Group ID: ${dogfoodingGroup.id}`);

    if (
      isSameString(message?.conversationId, dogfoodingGroup.id) &&
      message?.contentType?.typeId === "text" &&
      (message as any).content?.startsWith(config.linearCommand) &&
      (message as any).reference
    ) {
      log(`[INFO] Potential Linear command message received from ${(message as any).senderAddress}: ID ${message.id}`);
      log(`[INFO] Detected Linear command reply.`);
      try {
        const referencedMessageId = (message as any).reference;
        log(`[DEBUG] Fetching referenced message ID: ${referencedMessageId}`);

        const replyOptions: SendOptions = { reference: message.id };

        const originalMessages = await dogfoodingGroup.messages({
            limit: 10,
         }); 

        const originalMessage = originalMessages.find(m => m.id === referencedMessageId);

        if (!originalMessage || originalMessage.contentType?.typeId !== 'text') {
          log(`[WARNING] Could not find or decode referenced text message ${referencedMessageId}.`);
          await dogfoodingGroup.send(`Sorry, I couldn't find the original message to create a ticket from.`, replyOptions);
          continue;
        }

        const feedbackContent = originalMessage.content;
        const feedbackSender = (originalMessage as any).senderAddress ?? 'unknown';
        log(`[INFO] Found original feedback: "${feedbackContent}" from ${feedbackSender}`);

        const commandParts = (message as any).content.split(config.linearCommand);
        const customTitle = commandParts[1]?.trim();
        const ticketTitle = customTitle || `Feedback from ${feedbackSender}`;

        const result = await createLinearTicket({
          apiKey: config.linearApiKey,
          teamId: config.linearTeamId,
          title: ticketTitle,
          description: feedbackContent as string,
          feedbackSenderAddress: feedbackSender,
        });

        if (result.success && result.url) {
          await dogfoodingGroup.send(`✅ Linear ticket created: ${result.url}`, replyOptions);
        } else {
          await dogfoodingGroup.send(`❌ Failed to create Linear ticket: ${result.error || 'Unknown error'}`, replyOptions);
        }
      } catch (cmdError: unknown) {
         const errorMessage = cmdError instanceof Error ? cmdError.message : String(cmdError);
         log(`[ERROR] Error processing Linear command: ${errorMessage}`);
         try {
            const errorReplyOptions: SendOptions = { reference: message.id };
            await dogfoodingGroup.send(`❌ Error processing command: ${errorMessage}`, errorReplyOptions);
         } catch (replyError) {
            log(`[ERROR] Failed to send error reply for command processing.`);
         }
      }
      continue;
    }

    if (shouldSkipDM(message, client)) {
      log(
        `