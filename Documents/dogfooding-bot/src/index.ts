import dotenv from "dotenv";
dotenv.config();

import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex, getDbPath } from "./helpers/client.js";
import { logAgentDetails, validateEnvironment, log } from "./helpers/utils.js";
import { findOrCreateDogfoodingGroup, DOGFOODING_ADMIN_ADDRESS } from "./dogfooding.js";
import { listenForMessages } from "./stream.js";

// --- Retry Logic Constants and Helper ---
const MAX_RETRIES = 6; // Max number of retry attempts
const RETRY_DELAY_MS = 10000; // 10 seconds delay between retries
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// --- End Retry Logic ---

const {
  WALLET_KEY,
  ENCRYPTION_KEY,
  XMTP_ENV,
  LINEAR_API_KEY,
  LINEAR_TEAM_ID,
  LINEAR_COMMAND_TRIGGER,
} = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "LINEAR_API_KEY",
  "LINEAR_TEAM_ID",
  "LINEAR_COMMAND_TRIGGER",
]);

const signer = createSigner(WALLET_KEY as `0x${string}`);
const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
const receiverClient = await Client.create(signer, {
  dbEncryptionKey,
  env: XMTP_ENV as XmtpEnv,
  dbPath: getDbPath(XMTP_ENV),
});

async function main() {
  const client = receiverClient;

  const identifier = await signer.getIdentifier();
  const address = identifier.identifier;
  logAgentDetails(address, client.inboxId, XMTP_ENV);

  const group = await findOrCreateDogfoodingGroup(client);

  log(`[DEBUG] findOrCreateDogfoodingGroup returned: ${JSON.stringify(group)}`);

  if (!group) {
    log(`[ERROR] Failed to find or create the TBA Dogfooding group`);
    return; // Exit if group setup fails
  }

  log(`[INFO] Successfully found/created the TBA Dogfooding group: ${group.id}`);

  log("Syncing conversations...");
  await client.conversations.sync();

  // --- Implement Retry Loop Around Listener ---
  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    try {
      log(`[INFO] Starting message listener... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      // Call the main listener function
      await listenForMessages(client, group, {
        adminAddress: DOGFOODING_ADMIN_ADDRESS,
        linearApiKey: LINEAR_API_KEY,
        linearTeamId: LINEAR_TEAM_ID,
        linearCommand: LINEAR_COMMAND_TRIGGER,
      });

      // If listenForMessages exits cleanly (it shouldn't with the while(true)), reset retries.
      log("[WARN] listenForMessages exited unexpectedly. Resetting retry count.");
      retryCount = 0; // Reset if it somehow returns without error
      // Consider breaking the loop or exiting if clean exit is truly unexpected.
      // break;

    } catch (error: unknown) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`[ERROR] listenForMessages failed catastrophically (Attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`);
      log(`[DEBUG] Error details: ${error}`); // Log full error for debugging

      if (retryCount < MAX_RETRIES) {
        log(`[INFO] Waiting ${RETRY_DELAY_MS / 1000} seconds before retrying listener...`);
        await sleep(RETRY_DELAY_MS);
      } else {
        log("[FATAL] Maximum retry attempts reached for listenForMessages. Exiting application.");
        // Optional: Force exit if retries fail completely
        // process.exit(1);
        // Or re-throw the error to be caught by the outer handler
        throw new Error(`listenForMessages failed after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
    }
  }
  // --- End Retry Loop ---
}

// Outer catch block for initial setup errors or final retry failure
main().catch((error) => {
  log(`[FATAL] Unhandled error in main execution: ${error.message}`);
  process.exit(1); // Exit with error code on fatal error
});