import { log } from './utils.js';
// Simple persistent cache for member addresses
// In production, you might want to use a proper database
const memberAddressCache = new Map();
/**
 * Store a member's address when they join
 * @param inboxId - The member's inbox ID
 * @param address - The member's Ethereum address
 */
export function cacheMemberAddress(inboxId, address) {
    memberAddressCache.set(inboxId, address.toLowerCase());
    log(`[MEMBER-CACHE] Cached address for ${inboxId}: ${address}`);
}
/**
 * Get a member's cached address
 * @param inboxId - The member's inbox ID
 * @returns string | null - The cached address or null if not found
 */
export function getCachedMemberAddress(inboxId) {
    return memberAddressCache.get(inboxId) || null;
}
/**
 * Get all cached member addresses
 * @param inboxIds - Array of inbox IDs to get addresses for
 * @returns Array of {inboxId, address} pairs for members with cached addresses
 */
export function getCachedMemberAddresses(inboxIds) {
    const result = [];
    for (const inboxId of inboxIds) {
        const address = getCachedMemberAddress(inboxId);
        if (address) {
            result.push({ inboxId, address });
        }
    }
    log(`[MEMBER-CACHE] Found cached addresses for ${result.length}/${inboxIds.length} members`);
    return result;
}
/**
 * Remove a member's cached address
 * @param inboxId - The member's inbox ID
 */
export function removeCachedMemberAddress(inboxId) {
    if (memberAddressCache.delete(inboxId)) {
        log(`[MEMBER-CACHE] Removed cached address for ${inboxId}`);
    }
}
/**
 * Get the total number of cached addresses
 */
export function getCacheSize() {
    return memberAddressCache.size;
}
