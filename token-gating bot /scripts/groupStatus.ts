import "dotenv/config";
import { Client } from "@xmtp/node-sdk";
import { createSigner } from "../src/helpers/client.js";
import { log } from "../src/helpers/utils.js";
import { findOrCreateTokenGatedGroup } from "../src/traders.js";
import { getCacheSize } from "../src/helpers/memberCache.js";

async function checkGroupStatus() {
  const key = process.env.WALLET_KEY;
  if (!key) {
    log("[ERROR] WALLET_KEY is required");
    return;
  }

  log("[INFO] Starting XMTP client...");
  const signer = createSigner(key as `0x${string}`);
  const client = await Client.create(signer, {
    env: process.env.XMTP_ENV === "production" ? "production" : "dev",
  });

  const address = (await signer.getIdentifier()).identifier;
  log(`[INFO] XMTP client created. Bot address: ${address}`);

  try {
    // Get the token-gated group
    const group = await findOrCreateTokenGatedGroup(client);
    if (!group) {
      log("[ERROR] Failed to find token-gated group");
      return;
    }

    log(`[INFO] Group Name: "${group.name}"`);
    log(`[INFO] Group ID: ${group.id}`);

    // Get all members
    const members = await group.members();
    log(`[INFO] Total Members: ${members.length}`);

    if (members.length > 0) {
      log("[INFO] Current Members:");
      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        log(`  ${i + 1}. Inbox ID: ${member.inboxId}`);
      }
    } else {
      log("[INFO] Group is empty");
    }

    log(`[INFO] Cached Addresses: ${getCacheSize()}`);

  } catch (error) {
    log(`[ERROR] Failed to get group status: ${error}`);
  }
}

// Run the script
checkGroupStatus().catch((error) => {
  log(`Fatal error: ${error}`);
  process.exit(1);
});
