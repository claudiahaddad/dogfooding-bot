import { Client, Group, IdentifierKind } from "@xmtp/node-sdk";
import { log } from './utils.js';

// Cache for inbox ID to address mappings to avoid repeated lookups
const inboxToAddressCache = new Map<string, string>();

/**
 * Extract Ethereum address from message content
 * @param messageContent - The message content to parse
 * @returns string | null - The Ethereum address if found
 */
export function extractAddressFromMessage(messageContent: string): string | null {
  // Look for Ethereum address pattern (0x followed by 40 hex characters)
  const addressPattern = /0x[a-fA-F0-9]{40}/;
  const match = messageContent.match(addressPattern);
  
  if (match) {
    return match[0].toLowerCase();
  }
  
  return null;
}

/**
 * Verify if an address can receive XMTP messages
 * @param client - XMTP Client instance
 * @param address - Ethereum address to check
 * @returns Promise<boolean> - Whether the address can receive messages
 */
export async function canMessageAddress(client: Client, address: string): Promise<boolean> {
  try {
    // Create identifier object for the address
    const identifier = {
      identifierKind: IdentifierKind.Ethereum,
      identifier: address.toLowerCase()
    };
    
    // canMessage returns a Map<string, boolean>, we need to check the result
    const canMessageMap = await client.canMessage([identifier]);
    return canMessageMap.get(address.toLowerCase()) || false;
  } catch (error) {
    log(`[ADDRESS-RESOLVER] Error checking if can message ${address}: ${error}`);
    return false;
  }
}

/**
 * Try to resolve an inbox ID to an Ethereum address using available methods
 * Based on XMTP agent examples from ephemeraHQ/xmtp-agent-examples
 * @param client - XMTP Client instance
 * @param inboxId - The inbox ID to resolve  
 * @param messageContent - Optional message content to extract address from
 * @returns Promise<string | null> - The Ethereum address or null if not found
 */
export async function resolveInboxIdToAddress(
  client: Client,
  inboxId: string,
  messageContent?: string
): Promise<string | null> {
  // Check cache first
  if (inboxToAddressCache.has(inboxId)) {
    const cachedAddress = inboxToAddressCache.get(inboxId);
    log(`[ADDRESS-RESOLVER] Found cached address for ${inboxId}: ${cachedAddress}`);
    return cachedAddress || null;
  }

  try {
    log(`[ADDRESS-RESOLVER] Attempting to resolve inbox ID: ${inboxId}`);

    // Method 1: Try to extract address from message content
    if (messageContent) {
      const extractedAddress = extractAddressFromMessage(messageContent);
      if (extractedAddress) {
        // Verify the extracted address can receive XMTP messages
        const canMessage = await canMessageAddress(client, extractedAddress);
        if (canMessage) {
          inboxToAddressCache.set(inboxId, extractedAddress);
          log(`[ADDRESS-RESOLVER] Extracted and verified address ${extractedAddress} from message`);
          return extractedAddress;
        } else {
          log(`[ADDRESS-RESOLVER] Extracted address ${extractedAddress} cannot receive XMTP messages`);
        }
      }
    }

    // Method 2: Try to get address from member properties (if available)
    try {
      const groups = await client.conversations.listGroups();
      for (const group of groups) {
        const members = await group.members();
        for (const member of members) {
          if (member.inboxId === inboxId) {
            // Check if member has any address-related properties
            const memberAny = member as any;
            
            // Try various possible address properties
            const possibleAddressFields = [
              'address',
              'accountAddress', 
              'ethAddress',
              'walletAddress'
            ];
            
            for (const field of possibleAddressFields) {
              if (memberAny[field]) {
                const address = memberAny[field].toString().toLowerCase();
                if (address.match(/^0x[a-fA-F0-9]{40}$/)) {
                  const canMessage = await canMessageAddress(client, address);
                  if (canMessage) {
                    inboxToAddressCache.set(inboxId, address);
                    log(`[ADDRESS-RESOLVER] Found address ${address} in member.${field}`);
                    return address;
                  }
                }
              }
            }

            // Check accountAddresses array if it exists
            if (memberAny.accountAddresses && Array.isArray(memberAny.accountAddresses)) {
              for (const addr of memberAny.accountAddresses) {
                const address = (typeof addr === 'string' ? addr : addr.address || '').toLowerCase();
                if (address.match(/^0x[a-fA-F0-9]{40}$/)) {
                  const canMessage = await canMessageAddress(client, address);
                  if (canMessage) {
                    inboxToAddressCache.set(inboxId, address);
                    log(`[ADDRESS-RESOLVER] Found address ${address} in member.accountAddresses`);
                    return address;
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      log(`[ADDRESS-RESOLVER] Member lookup failed: ${error}`);
    }

    log(`[ADDRESS-RESOLVER] Could not resolve inbox ID ${inboxId} to address. User should include their wallet address in their message.`);
    return null;
  } catch (error) {
    log(`[ADDRESS-RESOLVER] Error resolving inbox ID ${inboxId}: ${error}`);
    return null;
  }
}

/**
 * Resolve multiple inbox IDs to addresses
 * @param client - XMTP Client instance  
 * @param inboxIds - Array of inbox IDs to resolve
 * @returns Promise<{inboxId: string, address: string | null}[]>
 */
export async function resolveMultipleInboxIdsToAddresses(
  client: Client,
  inboxIds: string[]
): Promise<{inboxId: string, address: string | null}[]> {
  log(`[ADDRESS-RESOLVER] Resolving ${inboxIds.length} inbox IDs to addresses`);
  
  const results = await Promise.allSettled(
    inboxIds.map(async (inboxId) => ({
      inboxId,
      address: await resolveInboxIdToAddress(client, inboxId)
    }))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      log(`[ADDRESS-RESOLVER] Failed to resolve ${inboxIds[index]}: ${result.reason}`);
      return {
        inboxId: inboxIds[index],
        address: null
      };
    }
  });
}

/**
 * Clear the address resolution cache
 */
export function clearAddressCache(): void {
  inboxToAddressCache.clear();
  log(`[ADDRESS-RESOLVER] Address cache cleared`);
}
