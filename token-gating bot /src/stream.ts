import { Client, DecodedMessage, Group } from "@xmtp/node-sdk";
import { isSameString, log } from "./helpers/utils.js";
import { checkTokenBalance, getTokenSymbol } from "./helpers/tokenGating.js";
import { loadTokenGatingConfig } from "./helpers/config.js";
import { cacheMemberAddress } from "./helpers/memberCache.js";

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
          log(`[DEBUG] Sender address: ${(message as any)?.senderAddress}`);
          log(`[DEBUG] Client inbox ID: ${client.inboxId}`);
          log(`[DEBUG] Message content type: ${message?.contentType?.typeId}`);

          // Inner try...catch for processing individual messages
          try {
            const senderInboxId = message?.senderInboxId ?? "";
            const senderAddress = (message as any)?.senderAddress; // Direct address from XMTP message
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

            // Since new conversations are handled automatically, this is likely a follow-up message
            // Check if sender is in the group and provide helpful response
            const members = await tokenGatedGroup.members();
            const isMember = members.some((member: { inboxId: string }) =>
              isSameString(member.inboxId, senderInboxId)
            );

            if (isMember) {
              log(`[MESSAGE] User ${senderInboxId} is already a member of the group`);
              await conversation.send(`You're already a member of @claudia's group chat ✨! Check your message requests if you can't find the group.`);
            } else {
              log(`[MESSAGE] User ${senderInboxId} sent a message but isn't in group. May need manual verification.`);
              
              // Try to get their address and check eligibility again
              if (senderAddress) {
                log(`[MESSAGE] Re-checking token balance for ${senderAddress}`);
                const hasRequiredTokens = await checkTokenBalance(
                  senderAddress as `0x${string}`,
                  tokenConfig
                );

                if (hasRequiredTokens) {
                  log(`[MESSAGE] User ${senderInboxId} now has required tokens. Adding to group...`);
                  try {
                    await tokenGatedGroup.addMembers([senderInboxId]);
                    cacheMemberAddress(senderInboxId, senderAddress);
                    await conversation.send(
                      `🎉 Great! I've verified you now hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens and added you to @claudia's group chat ✨!`
                    );
                  } catch (error) {
                    log(`[MESSAGE] Error adding user to group: ${error}`);
                    await conversation.send(`There was an issue adding you to the group. Please try starting a new conversation with me.`);
                  }
                } else {
                  await conversation.send(
                    `You still need to hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens to join @claudia's group chat ✨. Once you acquire them, start a fresh conversation with me!`
                  );
                }
              } else {
                await conversation.send(
                  `I couldn't verify your wallet address from this message. Please start a new conversation with me so I can automatically check your token balance!`
                );
              }
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
      await conversation.send(`Welcome back! You're already a member of @claudia's group chat ✨`);
      return;
    }

    // Get the peer's address - try multiple methods
    let peerAddress: string | null = null;
    
    // Method 1: Check if conversation has peerAddress
    if ((conversation as any).peerAddress) {
      peerAddress = (conversation as any).peerAddress;
      log(`[NEW-CONVERSATION] Got peer address from conversation: ${peerAddress}`);
    }
    
    // Method 2: Try to create a new DM and get address from there
    if (!peerAddress) {
      try {
        const dmConversation = await client.conversations.newDm(peerInboxId);
        if ((dmConversation as any).peerAddress) {
          peerAddress = (dmConversation as any).peerAddress;
          log(`[NEW-CONVERSATION] Got peer address from newDm: ${peerAddress}`);
        }
      } catch (error) {
        log(`[NEW-CONVERSATION] Could not create DM to get address: ${error}`);
      }
    }

    if (!peerAddress) {
      log(`[NEW-CONVERSATION] Could not determine peer address for ${peerInboxId}`);
      await conversation.send(
        `Hi! I couldn't automatically verify your wallet address. Please send me your wallet address like: "My wallet: 0x1234..." and I'll check if you qualify for @claudia's group chat ✨`
      );
      return;
    }

    log(`[NEW-CONVERSATION] Checking token balance for ${peerAddress}`);

    // Check token balance
    const hasRequiredTokens = await checkTokenBalance(
      peerAddress as `0x${string}`,
      tokenConfig
    );

    if (hasRequiredTokens) {
      log(`[NEW-CONVERSATION] User ${peerInboxId} (${peerAddress}) has required tokens. Adding to group...`);
      
      try {
        await tokenGatedGroup.addMembers([peerInboxId]);
        
        // Cache the address for future member scans
        cacheMemberAddress(peerInboxId, peerAddress);
        
        await conversation.send(
          `🎉 Welcome! I've verified you hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens and automatically added you to @claudia's group chat ✨. Check your message requests to view the group!`
        );
        
        log(`[NEW-CONVERSATION] Successfully added ${peerInboxId} to token-gated group`);
        
      } catch (addError) {
        log(`[NEW-CONVERSATION] Error adding user to group: ${addError}`);
        await conversation.send(
          `I verified you have the required tokens, but there was an issue adding you to the group. Please try messaging me again.`
        );
      }
      
    } else {
      log(`[NEW-CONVERSATION] User ${peerInboxId} (${peerAddress}) doesn't have required tokens`);
      await conversation.send(
        `❌ Sorry, you need to hold at least ${tokenConfig.minimumBalance} ${tokenSymbol} tokens to join @claudia's group chat ✨. Once you acquire the required tokens, start a conversation with me again to join!`
      );
    }

  } catch (error) {
    log(`[NEW-CONVERSATION] Error handling new conversation: ${error}`);
  }
}

