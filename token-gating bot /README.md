# traders-bot

# XMTP Token-Gated Bot

A bot that manages access to group chats based on ERC20 token holdings. Users must hold a minimum amount of specified tokens to join and remain in the group. Built with XMTP.

**Current Configuration**: Set up to gate access with token `0xF8987852A03903b0559FE6A31ECD5e3994eA0f16` on Base network.

## Setup

1. Install dependencies: `npm install`

2. Generate XMTP keys: `npm run gen:keys`

3. Copy `env.example` to `.env` and configure your environment variables:
   ```bash
   cp env.example .env
   ```

4. Edit `.env` and set your specific values:
   - `WALLET_KEY`: Your wallet's private key
   - `TOKEN_ADDRESS`: Already set to `0xF8987852A03903b0559FE6A31ECD5e3994eA0f16`
   - `MINIMUM_TOKEN_BALANCE`: Set your desired minimum token requirement (default: 5.0)

5. Set admin address in `src/traders.ts` (update `TRADERS_ADMIN_INBOX_ID` with your XMTP inbox ID)

6. Start the bot: `npm start`

## How It Works

1. **New Conversation**: When a user starts a conversation with the bot, it automatically checks their wallet's token balance
2. **Token Verification**: The bot verifies the user holds the minimum required tokens (configurable via `MINIMUM_TOKEN_BALANCE`)  
3. **Instant Access**: If eligible, the user is immediately added to "@claudia's group chat ✨" - no messages required!
4. **Periodic Checks**: Every hour, the bot scans all group members and removes those who no longer meet the token requirements
5. **Automatic Enforcement**: Users are automatically removed if they sell/transfer tokens below the minimum threshold

**User Experience**: Simply start a conversation with the bot and you'll be automatically verified and added to the group if you hold the required tokens! 🚀

## Environment Variables

Required:
- `WALLET_KEY`: Private key of the wallet (0x prefixed hex string)
- `TOKEN_ADDRESS`: ERC20 token contract address to gate access (e.g., "0xF8987852A03903b0559FE6A31ECD5e3994eA0f16")
- `MINIMUM_TOKEN_BALANCE`: Minimum number of tokens required to join/stay in group (e.g., "5.0")

Optional:
- `ENCRYPTION_KEY`: Encryption key for the local database
- `XMTP_ENV`: XMTP environment (dev/production, defaults to dev)
