import { fromString } from "uint8arrays";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import fs from "fs";
export const createSigner = (key) => {
    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ account, chain: base, transport: http() });
    return {
        type: "EOA",
        getIdentifier: () => ({
            identifierKind: 0 /* IdentifierKind.Ethereum */,
            identifier: account.address.toLowerCase(),
        }),
        signMessage: async (message) => {
            const signature = await wallet.signMessage({ message });
            return fromString(signature.slice(2), 'hex');
        },
    };
};
export const getEncryptionKeyFromHex = (hex) => {
    return fromString(hex, "hex");
};
export const getDbPath = (env, suffix = "xmtp") => {
    //Checks if the environment is a Railway deployment
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? ".data/xmtp";
    // Create database directory if it doesn't exist
    if (!fs.existsSync(volumePath)) {
        fs.mkdirSync(volumePath, { recursive: true });
    }
    const dbPath = `${volumePath}/${env}-${suffix}.db3`;
    return dbPath;
};
