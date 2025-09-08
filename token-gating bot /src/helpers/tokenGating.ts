import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { log } from './utils.js';

// ERC20 ABI for balanceOf function
const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]);

// Configuration for token gating
export interface TokenGatingConfig {
  tokenAddress: `0x${string}`;
  minimumBalance: number;
  chainId?: number;
}

// Create a public client for reading blockchain data
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

/**
 * Check if a wallet address holds the minimum required token balance
 * @param walletAddress - The wallet address to check
 * @param config - Token gating configuration
 * @returns Promise<boolean> - Whether the address meets the requirement
 */
export async function checkTokenBalance(
  walletAddress: `0x${string}`,
  config: TokenGatingConfig
): Promise<boolean> {
  try {
    log(`[TOKEN-GATE] Checking token balance for address: ${walletAddress}`);
    
    // Get token decimals and balance
    const [decimals, balance] = await Promise.all([
      publicClient.readContract({
        address: config.tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: config.tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      })
    ]);

    // Convert balance from wei to human readable format
    const balanceFormatted = parseFloat(formatUnits(balance as bigint, decimals));
    
    log(`[TOKEN-GATE] Address ${walletAddress} has balance: ${balanceFormatted} tokens (required: ${config.minimumBalance})`);
    
    return balanceFormatted >= config.minimumBalance;
  } catch (error) {
    log(`[TOKEN-GATE] Error checking token balance for ${walletAddress}: ${error}`);
    return false;
  }
}

/**
 * Get token symbol for logging purposes
 * @param tokenAddress - The token contract address
 * @returns Promise<string> - The token symbol
 */
export async function getTokenSymbol(tokenAddress: `0x${string}`): Promise<string> {
  try {
    const symbol = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'symbol',
    });
    return symbol as string;
  } catch (error) {
    log(`[TOKEN-GATE] Error getting token symbol: ${error}`);
    return 'UNKNOWN';
  }
}

/**
 * Check token balances for multiple addresses
 * @param addresses - Array of wallet addresses to check
 * @param config - Token gating configuration
 * @returns Promise<{address: string, hasRequiredBalance: boolean}[]>
 */
export async function checkMultipleTokenBalances(
  addresses: `0x${string}`[],
  config: TokenGatingConfig
): Promise<{address: string, hasRequiredBalance: boolean}[]> {
  log(`[TOKEN-GATE] Checking token balances for ${addresses.length} addresses`);
  
  const results = await Promise.allSettled(
    addresses.map(async (address) => ({
      address,
      hasRequiredBalance: await checkTokenBalance(address, config)
    }))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      log(`[TOKEN-GATE] Failed to check balance for ${addresses[index]}: ${result.reason}`);
      return {
        address: addresses[index],
        hasRequiredBalance: false
      };
    }
  });
}
