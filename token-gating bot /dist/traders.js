import { log, isSameString } from "./helpers/utils.js";
const GROUP_NAME = "@claudia's group chat ✨";
const TRADERS_ADMIN_INBOX_ID = "e09350ad5bab8a6b24e38f86500c67e0fb294e25cf527b0cd4f1cd32dede16e7";
export async function findOrCreateTokenGatedGroup(client) {
    // Find existing group by listing all groups and filtering
    const groups = await client.conversations.listGroups();
    const existingGroup = groups.find((g) => g.name === GROUP_NAME);
    if (existingGroup) {
        log(`[INFO] Found existing token-gated group - checking admin status...`);
        // Add owner to existing group if not already added
        if (!TRADERS_ADMIN_INBOX_ID) {
            log(`[ERROR] TRADERS_ADMIN_INBOX_ID is not set`);
            return existingGroup;
        }
        try {
            // Check if admin is already a member
            const members = await existingGroup.members();
            const ownerMember = members.find((member) => isSameString(member.inboxId, TRADERS_ADMIN_INBOX_ID));
            if (!ownerMember) {
                log(`[INFO] Adding owner ${TRADERS_ADMIN_INBOX_ID} to existing group...`);
                await existingGroup.addMembers([TRADERS_ADMIN_INBOX_ID]);
                // Wait a bit for the member to be added
                await new Promise((resolve) => setTimeout(resolve, 2000));
                // Get updated members list and promote to admin
                const updatedMembers = await existingGroup.members();
                const newOwnerMember = updatedMembers.find((member) => isSameString(member.inboxId, TRADERS_ADMIN_INBOX_ID));
                if (newOwnerMember) {
                    await existingGroup.addSuperAdmin(newOwnerMember.inboxId);
                    log(`[SUCCESS] Added ${TRADERS_ADMIN_INBOX_ID} as super admin to existing group`);
                }
                else {
                    log(`[WARNING] Could not find member ${TRADERS_ADMIN_INBOX_ID} to promote in existing group`);
                }
            }
            else {
                log(`[INFO] Owner ${TRADERS_ADMIN_INBOX_ID} is already a member of existing group`);
                // Try to promote them to admin anyway (in case they weren't admin before)
                try {
                    await existingGroup.addSuperAdmin(ownerMember.inboxId);
                    log(`[SUCCESS] Ensured ${TRADERS_ADMIN_INBOX_ID} is super admin of existing group`);
                }
                catch (adminError) {
                    log(`[INFO] ${TRADERS_ADMIN_INBOX_ID} may already be admin: ${adminError}`);
                }
            }
        }
        catch (error) {
            log(`[ERROR] Failed to add owner to existing group: ${error}`);
        }
        return existingGroup;
    }
    else {
        log(`[INFO] Creating new token-gated group...`);
        const group = await client.conversations.newGroup([], {
            groupName: GROUP_NAME,
            groupDescription: "@claudia's exclusive token-gated group chat ✨ Access is verified automatically based on your token holdings.",
            groupImageUrlSquare: "",
        });
        log(`[INFO] Group created with ID: ${group.id}`);
        // Add owner to group
        if (!TRADERS_ADMIN_INBOX_ID) {
            log(`[ERROR] TRADERS_ADMIN_INBOX_ID is not set`);
            return group;
        }
        log(`[INFO] Adding owner ${TRADERS_ADMIN_INBOX_ID} to group...`);
        try {
            await group.addMembers([TRADERS_ADMIN_INBOX_ID]);
            // Wait a bit for the member to be added
            await new Promise((resolve) => setTimeout(resolve, 2000));
            // Verify owner was added and promote them
            const members = await group.members();
            const ownerMember = members.find((member) => isSameString(member.inboxId, TRADERS_ADMIN_INBOX_ID));
            if (ownerMember) {
                await group.addSuperAdmin(ownerMember.inboxId);
                log(`[SUCCESS] Added ${TRADERS_ADMIN_INBOX_ID} as super admin (owner)`);
            }
            else {
                log(`[WARNING] Could not find member ${TRADERS_ADMIN_INBOX_ID} to add as super admin`);
            }
        }
        catch (error) {
            log(`[ERROR] Failed to add owner: ${error}`);
        }
        log(`[SUCCESS] Token-gated group created successfully`);
        return group;
    }
}
