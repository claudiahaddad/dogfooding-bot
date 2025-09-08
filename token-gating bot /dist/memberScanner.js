import { log } from "./helpers/utils.js";
import { checkMultipleTokenBalances, getTokenSymbol } from "./helpers/tokenGating.js";
import { getCachedMemberAddresses, removeCachedMemberAddress, getCacheSize } from "./helpers/memberCache.js";
// Scan interval in milliseconds (1 hour)
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
/**
 * Start the periodic member scanner that checks token balances every hour
 * @param client - XMTP Client instance
 * @param group - The group to monitor
 * @param tokenConfig - Token gating configuration
 */
export async function startMemberScanner(client, group, tokenConfig) {
    const tokenSymbol = await getTokenSymbol(tokenConfig.tokenAddress);
    log(`[MEMBER-SCANNER] Starting periodic member scanner for ${tokenSymbol} token gating`);
    log(`[MEMBER-SCANNER] Scanning interval: ${SCAN_INTERVAL_MS / 1000 / 60} minutes`);
    log(`[MEMBER-SCANNER] Required balance: ${tokenConfig.minimumBalance} ${tokenSymbol}`);
    log(`[MEMBER-SCANNER] Cached addresses: ${getCacheSize()}`);
    // Perform initial scan
    await scanGroupMembers(client, group, tokenConfig, tokenSymbol);
    // Set up periodic scanning
    setInterval(async () => {
        try {
            await scanGroupMembers(client, group, tokenConfig, tokenSymbol);
        }
        catch (error) {
            log(`[MEMBER-SCANNER] Error during periodic scan: ${error}`);
        }
    }, SCAN_INTERVAL_MS);
    log(`[MEMBER-SCANNER] Periodic member scanner started successfully`);
}
/**
 * Scan all group members and remove those who don't meet token requirements
 * @param client - XMTP Client instance
 * @param group - The group to scan
 * @param tokenConfig - Token gating configuration
 * @param tokenSymbol - Token symbol for logging
 */
async function scanGroupMembers(client, group, tokenConfig, tokenSymbol) {
    try {
        log(`[MEMBER-SCANNER] Starting member balance scan...`);
        // Get all group members
        const members = await group.members();
        log(`[MEMBER-SCANNER] Found ${members.length} members to check`);
        if (members.length === 0) {
            log(`[MEMBER-SCANNER] No members to scan`);
            return;
        }
        // Filter out admin/super admin members (they should not be removed)
        const adminInboxIds = await getAdminInboxIds(group);
        const regularMembers = members.filter(member => !adminInboxIds.includes(member.inboxId));
        log(`[MEMBER-SCANNER] Scanning ${regularMembers.length} regular members (excluding ${adminInboxIds.length} admins)`);
        if (regularMembers.length === 0) {
            log(`[MEMBER-SCANNER] No regular members to scan (only admins in group)`);
            return;
        }
        // Get cached addresses for members - much more efficient!
        const membersWithAddresses = getCachedMemberAddresses(regularMembers.map(member => member.inboxId));
        log(`[MEMBER-SCANNER] Found cached addresses for ${membersWithAddresses.length}/${regularMembers.length} members`);
        if (membersWithAddresses.length === 0) {
            log(`[MEMBER-SCANNER] No cached addresses found for regular members`);
            log(`[MEMBER-SCANNER] Note: Addresses are cached when users join via the bot. Members who joined before this system won't be scanned until they message the bot again.`);
            return;
        }
        // Check token balances for all resolved addresses
        const balanceChecks = await checkMultipleTokenBalances(membersWithAddresses.map(member => member.address), tokenConfig);
        // Identify members who don't meet the requirements
        const membersToRemove = [];
        for (let i = 0; i < balanceChecks.length; i++) {
            const balanceCheck = balanceChecks[i];
            const memberWithAddress = membersWithAddresses[i];
            if (!balanceCheck.hasRequiredBalance) {
                membersToRemove.push(memberWithAddress.inboxId);
                log(`[MEMBER-SCANNER] Member ${memberWithAddress.inboxId} (${memberWithAddress.address}) does not meet balance requirements`);
            }
            else {
                log(`[MEMBER-SCANNER] Member ${memberWithAddress.inboxId} (${memberWithAddress.address}) meets balance requirements`);
            }
        }
        // Remove members who don't meet requirements
        if (membersToRemove.length > 0) {
            log(`[MEMBER-SCANNER] Removing ${membersToRemove.length} members who don't meet token requirements`);
            for (const inboxId of membersToRemove) {
                try {
                    await group.removeMembers([inboxId]);
                    log(`[MEMBER-SCANNER] Removed member ${inboxId} from group`);
                    // Clean up cached address since they're no longer in the group
                    removeCachedMemberAddress(inboxId);
                    // Optional: Send them a DM explaining why they were removed
                    try {
                        await notifyRemovedMember(client, inboxId, tokenConfig.minimumBalance, tokenSymbol);
                    }
                    catch (notifyError) {
                        log(`[MEMBER-SCANNER] Could not notify removed member ${inboxId}: ${notifyError}`);
                    }
                }
                catch (removeError) {
                    log(`[MEMBER-SCANNER] Error removing member ${inboxId}: ${removeError}`);
                }
            }
            log(`[MEMBER-SCANNER] Successfully removed ${membersToRemove.length} members`);
        }
        else {
            log(`[MEMBER-SCANNER] All members meet token requirements, no removals needed`);
        }
        log(`[MEMBER-SCANNER] Member balance scan completed`);
    }
    catch (error) {
        log(`[MEMBER-SCANNER] Error during member scan: ${error}`);
    }
}
/**
 * Get admin and super admin inbox IDs to exclude from removal
 * @param group - The group to check
 * @returns Promise<string[]> - Array of admin inbox IDs
 */
async function getAdminInboxIds(group) {
    try {
        const adminInboxIds = [];
        // Get super admins
        if (group.listSuperAdmins) {
            const superAdmins = await group.listSuperAdmins();
            adminInboxIds.push(...superAdmins.map((admin) => admin.inboxId || admin));
        }
        // Get regular admins  
        if (group.listAdmins) {
            const admins = await group.listAdmins();
            adminInboxIds.push(...admins.map((admin) => admin.inboxId || admin));
        }
        return [...new Set(adminInboxIds)]; // Remove duplicates
    }
    catch (error) {
        log(`[MEMBER-SCANNER] Error getting admin inbox IDs: ${error}`);
        return [];
    }
}
/**
 * Notify a removed member via DM about why they were removed
 * @param client - XMTP Client instance
 * @param inboxId - Inbox ID of the removed member
 * @param requiredBalance - Required token balance
 * @param tokenSymbol - Token symbol
 */
async function notifyRemovedMember(client, inboxId, requiredBalance, tokenSymbol) {
    try {
        // Create or get existing conversation with the removed member
        const conversation = await client.conversations.newDm(inboxId);
        const message = `🔒 You have been removed from @claudia's group chat ✨ because your wallet no longer holds the required ${requiredBalance} ${tokenSymbol} tokens. You can rejoin by acquiring the required tokens and messaging this bot again!`;
        await conversation.send(message);
        log(`[MEMBER-SCANNER] Notified removed member ${inboxId}`);
    }
    catch (error) {
        log(`[MEMBER-SCANNER] Failed to notify removed member ${inboxId}: ${error}`);
    }
}
