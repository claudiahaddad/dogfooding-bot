import dotenv from "dotenv";
dotenv.config();
export function validateEnvironment(requiredEnvVars) {
    const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
        throw new Error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
    }
    return process.env;
}
export function logAgentDetails(address, inboxId, env) {
    console.log("XMTP Agent Details:");
    console.log(`Address: ${address}`);
    console.log(`Inbox ID: ${inboxId}`);
    console.log(`Environment: ${env}`);
}
const timestamp = () => new Date().toISOString().replace("T", " ").substring(0, 19);
export function log(message) {
    console.log(`[${timestamp()}] [INFO] ${message}`);
}
export function isSameString(a, b) {
    return a?.toLowerCase() === b?.toLowerCase();
}
