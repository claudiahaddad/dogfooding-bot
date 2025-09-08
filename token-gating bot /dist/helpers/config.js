import { log } from './utils.js';
/**
 * Load and validate token gating configuration from environment variables
 * @returns TokenGatingConfig - The validated configuration
 */
export function loadTokenGatingConfig() {
    const tokenAddress = process.env.TOKEN_ADDRESS;
    const minimumBalanceStr = process.env.MINIMUM_TOKEN_BALANCE;
    if (!tokenAddress) {
        throw new Error('TOKEN_ADDRESS environment variable is required');
    }
    if (!minimumBalanceStr) {
        throw new Error('MINIMUM_TOKEN_BALANCE environment variable is required');
    }
    // Validate token address format
    if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
        throw new Error('TOKEN_ADDRESS must be a valid Ethereum address (0x followed by 40 hex characters)');
    }
    const minimumBalance = parseFloat(minimumBalanceStr);
    if (isNaN(minimumBalance) || minimumBalance < 0) {
        throw new Error('MINIMUM_TOKEN_BALANCE must be a valid positive number');
    }
    const config = {
        tokenAddress,
        minimumBalance,
    };
    log(`[CONFIG] Token gating configuration loaded:`);
    log(`[CONFIG] Token Address: ${config.tokenAddress}`);
    log(`[CONFIG] Minimum Balance: ${config.minimumBalance}`);
    return config;
}
/**
 * Load all environment variables and validate they exist
 */
export function validateRequiredEnvironmentVariables() {
    const requiredVars = [
        'WALLET_KEY',
        'TOKEN_ADDRESS',
        'MINIMUM_TOKEN_BALANCE'
    ];
    const optionalVars = [
        'ENCRYPTION_KEY',
        'XMTP_ENV'
    ];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    log(`[CONFIG] All required environment variables are present`);
    // Log optional variables that are set
    optionalVars.forEach(varName => {
        if (process.env[varName]) {
            log(`[CONFIG] Optional variable ${varName} is set`);
        }
        else {
            log(`[CONFIG] Optional variable ${varName} is not set, using defaults`);
        }
    });
}
