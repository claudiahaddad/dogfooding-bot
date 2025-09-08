import "dotenv/config";
import { Client } from "@xmtp/node-sdk";
import { createSigner } from "../src/helpers/client.js";
import { log } from "../src/helpers/utils.js";
import { findOrCreateTokenGatedGroup } from "../src/traders.js";
import { removeCachedMemberAddress, getCacheSize } from "../src/helpers/memberCache.js";

async function clearGroup() {
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

  // Get the token-gated group
  const group = await findOrCreateTokenGatedGroup(client);
  if (!group) {
    log("[ERROR] Failed to find token-gated group");
    return;
  }

  log(`[INFO] Found group: "${group.name}"`);

  // Get all members
  const members = await group.members();
  log(`[INFO] Group has ${members.length} total members`);

  if (members.length === 0) {
    log("[INFO] Group is already empty!");
    return;
  }

  // Get admin inbox IDs to protect them from removal
  const adminInboxIds = await getAdminInboxIds(group);
  log(`[INFO] Found ${adminInboxIds.length} admin(s) to protect from removal`);

  // Filter out admins - only remove regular members
  const regularMembers = members.filter(member => 
    !adminInboxIds.includes(member.inboxId)
  );

  log(`[INFO] Will remove ${regularMembers.length} regular members (keeping ${adminInboxIds.length} admins)`);

  if (regularMembers.length === 0) {
    log("[INFO] No regular members to remove - only admins in group");
    return;
  }

  // Confirm before proceeding
  log(`[WARN] About to remove ${regularMembers.length} members from "${group.name}"`);
  log("[WARN] This action cannot be undone!");
  
  // Remove all regular members
  const inboxIdsToRemove = regularMembers.map(member => member.inboxId);
  
  try {
    log("[INFO] Removing members from group...");
    await group.removeMembers(inboxIdsToRemove);
    
    // Clear cached addresses for removed members
    for (const inboxId of inboxIdsToRemove) {
      removeCachedMemberAddress(inboxId);
    }
    
    log(`[SUCCESS] Successfully removed ${regularMembers.length} members from the group`);
    log(`[INFO] Cleared ${regularMembers.length} cached addresses`);
    log(`[INFO] Remaining cached addresses: ${getCacheSize()}`);
    
    // Verify the group is now clean
    const updatedMembers = await group.members();
    log(`[INFO] Group now has ${updatedMembers.length} members (should only be admins)`);
    
  } catch (error) {
    log(`[ERROR] Failed to remove members: ${error}`);
  }
}

/**
 * Get admin and super admin inbox IDs to exclude from removal
 * @param group - The group to check
 * @returns Promise<string[]> - Array of admin inbox IDs
 */
async function getAdminInboxIds(group: any): Promise<string[]> {
  try {
    const adminInboxIds: string[] = [];
    
    // Get super admins
    if ((group as any).listSuperAdmins) {
      try {
        const superAdmins = await (group as any).listSuperAdmins();
        adminInboxIds.push(...superAdmins.map((admin: any) => admin.inboxId || admin));
        log(`[INFO] Found ${superAdmins.length} super admin(s)`);
      } catch (error) {
        log(`[WARN] Could not get super admins: ${error}`);
      }
    }
    
    // Get regular admins  
    if ((group as any).listAdmins) {
      try {
        const admins = await (group as any).listAdmins();
        adminInboxIds.push(...admins.map((admin: any) => admin.inboxId || admin));
        log(`[INFO] Found ${admins.length} regular admin(s)`);
      } catch (error) {
        log(`[WARN] Could not get regular admins: ${error}`);
      }
    }

    return [...new Set(adminInboxIds)]; // Remove duplicates
  } catch (error) {
    log(`[ERROR] Error getting admin inbox IDs: ${error}`);
    return [];
  }
}

// Run the script
clearGroup().catch((error) => {
  log(`Fatal error: ${error}`);
  process.exit(1);
});
