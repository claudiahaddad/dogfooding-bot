import { IdentifierKind, type Signer } from "@xmtp/node-sdk";
import { fromString } from "uint8arrays";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Wallet } from "ethers";
import fs from "fs";

export const createSigner = (key: `0x${string}`): Signer => {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: base, transport: http() });

  return {
    type: "EOA",
    getIdentifier: () => ({
      identifierKind: IdentifierKind.Ethereum,
      identifier: account.address.toLowerCase(),
    }),
    signMessage: async (message: string) => {
      const signature = await wallet.signMessage({ message });
      return fromString(signature.slice(2), 'hex');
    },
  };
};

export const getEncryptionKeyFromHex = (hex: string) => {
  return fromString(hex, "hex");
};

export const getDbPath = (env: string, suffix: string = "xmtp") => {
  // Use Railway's volume path or fallback to local path
  const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH || ".data/xmtp";
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(volumePath)) {
    fs.mkdirSync(volumePath, { recursive: true });
  }
  
  return `${volumePath}/${env}-${suffix}.db3`;
}; 