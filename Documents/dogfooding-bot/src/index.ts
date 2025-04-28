import dotenv from "dotenv";
dotenv.config();

import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex, getDbPath } from "./helpers/client.js";
import { logAgentDetails, validateEnvironment, log } from "./helpers/utils.js";
import { findOrCreateDogfoodingGroup, DOGFOODING_ADMIN_ADDRESS } from "./dogfooding.js";
import { listenForMessages } from "./stream.js";
import { createLinearTicket } from "./linear.js";

const {
  WALLET_KEY,
  ENCRYPTION_KEY,
  XMTP_ENV,
  LINEAR_API_KEY,
  LINEAR_TEAM_ID,
  LINEAR_COMMAND_TRIGGER,
} = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "LINEAR_API_KEY",
  "LINEAR_TEAM_ID",
  "LINEAR_COMMAND_TRIGGER",
]);

const signer = createSigner(WALLET_KEY as `0x${string}`);
const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
const receiverClient = await Client.create(signer, {
  dbEncryptionKey,
  env: XMTP_ENV as XmtpEnv,
  dbPath: getDbPath(XMTP_ENV),
});

async function main() {
  const client = receiverClient;

  const identifier = await signer.getIdentifier();
  const address = identifier.identifier;
  logAgentDetails(address, client.inboxId, XMTP_ENV);

  const group = await findOrCreateDogfoodingGroup(client);

  if (!group) {
    log(`[ERROR] Failed to find or create the TBA Dogfooding group`);
    return;
  }

  log(`[INFO] Successfully found/created the TBA Dogfooding group: ${group.id}`);

  log("Syncing conversations...");
  await client.conversations.sync();

  log("Listening for messages...");
  await listenForMessages(client, group, {
    adminAddress: DOGFOODING_ADMIN_ADDRESS,
    linearApiKey: LINEAR_API_KEY,
    linearTeamId: LINEAR_TEAM_ID,
    linearCommand: LINEAR_COMMAND_TRIGGER,
  });
}

main().catch((error) => {
  log(`[ERROR] ${error.message}`);
});