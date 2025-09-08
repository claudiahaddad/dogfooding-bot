import { Client, DecodedMessage, Group } from "@xmtp/node-sdk";
import { isSameString, log } from "./helpers/utils.js";
import { checkTokenBalance, getTokenSymbol } from "./helpers/tokenGating.js";
import { loadTokenGatingConfig } from "./helpers/config.js";

// --- Retry Logic Constants and Helper ---
const MAX_RETRIES = 6; // Max number of retry attempts
const RETRY_DELAY_MS = 10000; // Delay between retries in milliseconds (10 seconds)

// Helper function to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// --- End of Retry Logic ---

export async function listenForMessages(client: Client, tokenGatedGroup: Group<any>) {
    let retryCount = 0;
    
    // Load token gating configuration
    const tokenConfig = loadTokenGatingConfig();
    const tokenSymbol = await getTokenSymbol(tokenConfig.tokenAddress);
    
    log(`[TOKEN-GATE] Token gating enabled for ${tokenSymbol} (${tokenConfig.tokenAddress})`);
    log(`[TOKEN-GATE] Minimum balance required: ${tokenConfig.minimumBalance} ${tokenSymbol}`);

    // Outer loop for retry mechanism
    while (retryCount < MAX_RETRIES) {
      try {
        log(
          `Starting message stream... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        // Initialize streams for both new conversations and messages
        const conversationStream = client.conversations.stream();
        const messageStream = await client.conversations.streamAllMessages();
        
        log("Conversation and message streams started successfully...");

        // Handle new conversations first
        (async () => {
          try {
            for await (const conversation of conversationStream) {
              await handleNewConversation(client, conversation, tokenGatedGroup, tokenConfig, tokenSymbol);
            }
          } catch (error) {
            log(`[CONVERSATION-STREAM] Error in conversation stream: ${error}`);
          }
        })();

        // Process messages from the stream (for existing conversations)
        for await (const message of messageStream) {
          // Simplified skip logic: only check for self and non-text initially
          if (shouldSkip(message, client)) {
            log(
              `[DEBUG] Skipping message ${message?.id}: Self-message or non-text content.`
            );
            continue;
          }

          log(`[DEBUG] Message received from: ${message?.senderInboxId}`);
          log(`[DEBUG] Client inbox ID: ${client.inboxId}`);
          log(`[DEBUG] Message content type: ${message?.contentType?.typeId}`);

          // Inner try...catch for processing individual messages
          try {
            const senderInboxId = message?.senderInboxId ?? "";
            const conversationId = message?.conversationId;

            if (!conversationId) {
              log(`[WARN] Skipping message ${message?.id}: Missing conversationId.`);
              continue;
            }

            // Get the conversation object
            const conversation = await client.conversations.getConversationById(
              conversationId
            );

            if (!conversation) {
              log(`[ERROR] Could not find conversation for message ${message?.id} with conversationId ${conversationId}`);
              continue;
            }

            // Explicitly check if the conversation is a Group
            if (conversation instanceof Group) {
              log(`[DEBUG] Skipping message ${message?.id}: Is a group chat.`);
              continue; // Skip group messages
            }

            // --- Proceed only if it's confirmed to be a DM ---
            log(`[DEBUG] Message ${message?.id} is a DM from existing conversation.`);

            // Get message content - ensure it's a string
            const messageContent = typeof message?.content === 'string' ? message.content.trim().toLowerCase() : '';
            log(`[DEBUG] Message content: "${messageContent}"`);

            // Check if sender is in the group first
            const members = await tokenGatedGroup.members();
            const isMember = members.some((member: { inboxId: string }) =>
              isSameString(member.inboxId, senderInboxId)
            );

            if (isMember) {
              log(`[MESSAGE] User ${senderInboxId} is already a member of the group`);
              await conversation.send(`You're already a member of Claudia's chat ✨! Check your message requests if you can't find the group.`);
            } else if (messageContent === "gm") {
              log(`[MESSAGE] User ${senderInboxId} said 'gm' - checking token eligibility...`);
              
              // Get sender address using XMTP SDK method
              const inboxState = await client.preferences.inboxStateFromInboxIds([
                message.senderInboxId,
              ]);
              const senderAddress = inboxState[0]?.identifiers[0]?.identifier;
              log(`[ADDRESS] Sender address from inbox state: ${senderAddress}`);
              
              if (senderAddress) {
                log(`[MESSAGE] Checking token balance for ${senderAddress}`);
                const hasRequiredTokens = await checkTokenBalance(
                  senderAddress as `0x${string}`,
                  tokenConfig
                );

                if (hasRequiredTokens) {
                  log(`[MESSAGE] User ${senderInboxId} has required tokens. Adding to group...`);
                  try {
                    await tokenGatedGroup.addMembers([senderInboxId]);
                    await conversation.send(
                      `🎉 GM! I've verified you hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens and added you to Claudia's chat ✨! Check your message requests to view the group.`
                    );
                  } catch (error) {
                    log(`[MESSAGE] Error adding user to group: ${error}`);
                    await conversation.send(`I verified you have the required tokens, but there was an issue adding you to the group. Please try saying 'gm' again.`);
                  }
                } else {
                  await conversation.send(
                    `❌ GM! Unfortunately, you need to hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens to join Claudia's chat ✨. Once you acquire the required tokens, say 'gm' again to join!`
                  );
                }
              } else {
                log(`[ADDRESS] No address available from inbox state for ${senderInboxId}`);
                await conversation.send(
                  `GM! I couldn't detect your wallet address from your inbox ID. Please try again or contact support if the issue persists.`
                );
              }
            } else {
              // Not a "gm" message - provide guidance
              log(`[MESSAGE] User ${senderInboxId} sent non-gm message: "${messageContent}"`);
              await conversation.send(
                `💬 To join Claudia's chat, simply say "gm" and I'll check if you hold the required tokens!`
              );
            }
          } catch (processingError: unknown) {
            // Log errors processing individual messages but continue the stream
            const errorMessage =
              processingError instanceof Error ? processingError.message : String(processingError);
            log(`Error processing message ${message?.id}: ${errorMessage}`);

            // Attempt to send error reply
            try {
              const convIdForError = message?.conversationId;
              if (convIdForError) {
                 const errorConversation = await client.conversations.getConversationById(convIdForError);
                 // Check if it's not a group before sending error
                 if (errorConversation && !(errorConversation instanceof Group)) {
                    await errorConversation.send(
                      "Sorry, I encountered an error processing your message."
                    );
                 }
              }
            } catch (sendError) {
              log(
                `Failed to send error message after processing error: ${
                  sendError instanceof Error ? sendError.message : String(sendError)
                }`
              );
            }
          } // End of inner try...catch for message processing
        } // End of for await...of stream loop

        // If the stream completes without error (less common for indefinite streams), reset retry count
        log("Message stream completed normally.");
        retryCount = 0; // Reset retries if stream finishes cleanly

      } catch (streamError: unknown) {
        // Handle errors related to the stream itself (initialization or fatal error)
        retryCount++;
        log(`Stream error (Attempt ${retryCount}/${MAX_RETRIES}): ${streamError instanceof Error ? streamError.message : String(streamError)}`);
        if (streamError instanceof Error && streamError.stack) {
            log(`Stack trace: ${streamError.stack}`);
        }

        if (retryCount < MAX_RETRIES) {
          log(`Waiting ${RETRY_DELAY_MS / 1000} seconds before retrying stream...`);
          await sleep(RETRY_DELAY_MS);
        } else {
          log("Maximum retry attempts reached for message stream. Exiting listener.");
          // The while loop condition will handle exiting
        }
      } // End of outer try...catch for stream handling
    } // End of while loop for retries

    log("listenForMessages function finished."); // Indicates the retry loop has exited
}

// Updated shouldSkip: Only checks self-message and content type
function shouldSkip(
  message: DecodedMessage<any> | undefined,
  client: Client
) {
  if (!message) {
    return true;
  }
  return (
    isSameString(message.senderInboxId, client.inboxId) ||
    message.contentType?.typeId !== "text"
  );
}

/**
 * Handle new conversations - automatically check token eligibility and add to group
 */
async function handleNewConversation(
  client: Client,
  conversation: any,
  tokenGatedGroup: Group<any>,
  tokenConfig: any,
  tokenSymbol: string
): Promise<void> {
  try {
    log(`[NEW-CONVERSATION] New conversation detected`);

    // Skip if it's a group conversation
    if (conversation instanceof Group) {
      log(`[NEW-CONVERSATION] Skipping - is a group conversation`);
      return;
    }

    // Get peer inbox ID
    const peerInboxId = conversation.peerInboxId;
    if (!peerInboxId) {
      log(`[NEW-CONVERSATION] No peer inbox ID found`);
      return;
    }

    log(`[NEW-CONVERSATION] New DM from: ${peerInboxId}`);

    // Check if user is already in the token-gated group
    const members = await tokenGatedGroup.members();
    const isAlreadyMember = members.some((member: { inboxId: string }) =>
      isSameString(member.inboxId, peerInboxId)
    );

    if (isAlreadyMember) {
      log(`[NEW-CONVERSATION] User ${peerInboxId} is already in the group`);
      await conversation.send(`Welcome back! You're already a member of Claudia's chat ✨`);
      return;
    }

    // Send welcome message asking them to say "gm" to request access
    await conversation.send(
      `👋 Hey there! Welcome to my token-gated bot.\n\nTo join Claudia's chat, you need to hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens.\n\n💬 Say "gm" and I'll automatically check your wallet and add you to the group if you qualify!`
    );
    
    log(`[NEW-CONVERSATION] Sent welcome message to ${peerInboxId}, waiting for 'gm'`);

  } catch (error) {
    log(`[NEW-CONVERSATION] Error handling new conversation: ${error}`);
  }
}

