import dotenv from "dotenv";
dotenv.config();

import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex } from "./helpers/client.js";
import { logAgentDetails, validateEnvironment, log } from "./helpers/utils.js";
import { findOrCreateDogfoodingGroup } from "./dogfooding.js";
import { listenForMessages } from "./stream.js";

const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV } = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
]);

async function main() {
  const signer = createSigner(WALLET_KEY as `0x${string}`);
  const encryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

  const client = await Client.create(signer, {
    env: XMTP_ENV as XmtpEnv,
    dbEncryptionKey: encryptionKey,
  });

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
  await listenForMessages(client, group);
}

main().catch((error) => {
  log(`Fatal error: ${error}`);
  process.exit(1);
});
