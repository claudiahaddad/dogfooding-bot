# bot-practice

# TBA Dogfooding Bot

A bot that automatically adds users to a TBA Dogfooding group chat when they message it. Built with XMTP.

## Setup

1. Install dependencies: `npm install`

2. Generate XMTP keys: `npm run gen:keys`

3. Start the bot: `npm start`

## Environment Variables

- `WALLET_KEY`: Private key of the wallet
- `ENCRYPTION_KEY`: Encryption key for the local database
- `XMTP_ENV`: XMTP environment (dev/production)
