import "dotenv/config";
import { Client, Conversation } from "@xmtp/node-sdk";
import { createSigner } from "./helpers/client.js";
import { log } from "./helpers/utils.js";
import { listenForMessages } from "./stream.js";
import { findOrCreateTokenGatedGroup } from "./traders.js";
import { validateRequiredEnvironmentVariables, loadTokenGatingConfig } from "./helpers/config.js";
import { startMemberScanner } from "./memberScanner.js";

async function run() {
  // Validate all required environment variables
  try {
    validateRequiredEnvironmentVariables();
  } catch (error) {
    log(`[ERROR] ${error}`);
    return;
  }

  const key = process.env.WALLET_KEY;
  if (!key) {
    log("[ERROR] WALLET_KEY is required");
    return;
  }
  
  // Load token gating configuration
  const tokenConfig = loadTokenGatingConfig();

  log("[INFO] Starting XMTP client...");
  const signer = createSigner(key as `0x${string}`);
  const client = await Client.create(signer, {
    env: process.env.XMTP_ENV === "production" ? "production" : "dev",
  });

  const address = (await signer.getIdentifier()).identifier;
  log(
    `[INFO] XMTP client created. Inbox ID: ${client.inboxId}, Address: ${address}`
  );

  if (!client.isRegistered) {
    log("[INFO] Registering XMTP client...");
    await client.register();
    log("[INFO] XMTP client registered");
  } else {
    log("[INFO] XMTP client already registered");
  }

  // Create or get the token-gated group
  const tokenGatedGroup = await findOrCreateTokenGatedGroup(client);
  if (!tokenGatedGroup) {
    log("[ERROR] Failed to create or find token-gated group");
    return;
  }

  // Start the member scanner for periodic token balance checks
  await startMemberScanner(client, tokenGatedGroup, tokenConfig);

  // Start listening for messages
  await listenForMessages(client, tokenGatedGroup);
}

run().catch((error) => {
  log(`Fatal error: ${error}`);
  process.exit(1);
});
