import "dotenv/config";
import { Client } from "@xmtp/node-sdk";
import { createSigner } from "../src/helpers/client.js";
import { log } from "../src/helpers/utils.js";
import { findOrCreateTokenGatedGroup } from "../src/traders.js";
import { removeCachedMemberAddress, getCacheSize } from "../src/helpers/memberCache.js";

async function clearGroupSimple() {
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

  log("[INFO] XMTP client created");

  try {
    // Get the token-gated group
    const group = await findOrCreateTokenGatedGroup(client);
    if (!group) {
      log("[ERROR] Failed to find token-gated group");
      return;
    }

    log(`[INFO] Found group: "${group.name}"`);

    // Get all members
    const members = await group.members();
    log(`[INFO] Group currently has ${members.length} members`);

    if (members.length === 0) {
      log("[INFO] Group is already empty!");
      return;
    }

    // Remove each member individually to handle sync issues better
    let removedCount = 0;
    for (const member of members) {
      try {
        log(`[INFO] Removing member: ${member.inboxId.substring(0, 12)}...`);
        await group.removeMembers([member.inboxId]);
        
        // Clear cached address
        removeCachedMemberAddress(member.inboxId);
        
        removedCount++;
        log(`[SUCCESS] Removed member ${removedCount}/${members.length}`);
        
        // Small delay to avoid sync issues
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        log(`[WARN] Failed to remove member ${member.inboxId}: ${error}`);
        // Continue trying to remove other members
      }
    }

    log(`[INFO] Removal process completed. Removed ${removedCount}/${members.length} members`);
    
    // Check final state
    const finalMembers = await group.members();
    log(`[INFO] Group now has ${finalMembers.length} members remaining`);
    log(`[INFO] Cached addresses remaining: ${getCacheSize()}`);

    if (finalMembers.length === 0) {
      log("[SUCCESS] 🎉 Group successfully cleared for testing!");
    } else {
      log(`[WARN] ${finalMembers.length} members still remain in group`);
      log("[INFO] Remaining members:");
      finalMembers.forEach((member, i) => {
        log(`  ${i + 1}. ${member.inboxId.substring(0, 12)}...`);
      });
    }

  } catch (error) {
    log(`[ERROR] Script failed: ${error}`);
  }
}

// Run the script
clearGroupSimple().catch((error) => {
  log(`Fatal error: ${error}`);
  process.exit(1);
});
