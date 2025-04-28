import { Client, IdentifierKind, type Group } from "@xmtp/node-sdk";
import { log, isSameString } from "./helpers/utils.js";

const GROUP_NAME = "TBA Dogfooders";
export const DOGFOODING_ADMIN_ADDRESS = "0x80245b9C0d2Ef322F2554922cA86Cf211a24047F";

export async function findOrCreateDogfoodingGroup(client: Client): Promise<Group> {
  const group = await findDogfoodingGroup(client);
  if (group) {
    log(`[INFO] Found existing ${GROUP_NAME} group`);
    return group;
  }

  log(`[INFO] Creating new ${GROUP_NAME} group...`);

  const newGroup = await client.conversations.newGroup([], {
    groupName: GROUP_NAME,
    groupDescription: `The ${GROUP_NAME} community group`,
  });

  await addAdminToGroup(client, newGroup);
  return newGroup;
}

const findDogfoodingGroup = async (client: Client): Promise<Group | undefined> => {
  log(`[INFO] Looking for existing ${GROUP_NAME} group...`);
  await client.conversations.sync();

  const conversations = await client.conversations.list();

  const group = conversations.find((g) => (g as Group).name === GROUP_NAME) as
    | Group
    | undefined;

  return group;
};

const addAdminToGroup = async (client: Client, group: Group) => {
  if (!DOGFOODING_ADMIN_ADDRESS) {
    log(`[ERROR] DOGFOODING_ADMIN_ADDRESS is not set`);
    return;
  }

  log(`[INFO] Adding admin ${DOGFOODING_ADMIN_ADDRESS} to group ${group.id}...`);

  try {
    await group.addMembersByIdentifiers([
      {
        identifier: DOGFOODING_ADMIN_ADDRESS,
        identifierKind: IdentifierKind.Ethereum,
      },
    ]);
    log(`[INFO] Ensured ${DOGFOODING_ADMIN_ADDRESS} is a member of group ${group.id}`);
  } catch (addMemberError: any) {
    log(`[WARN] Could not explicitly add ${DOGFOODING_ADMIN_ADDRESS} as member (may already exist): ${addMemberError.message}`);
  }

  let memberInboxId: string | undefined;
  try {
    await group.sync();
    const members = await group.members();
    const member = members.find(
      (m: {
        accountIdentifiers: Array<{
          identifierKind: number;
          identifier: string;
        }>;
        inboxId: string;
      }) =>
        m.accountIdentifiers.some(
          (id) =>
            id.identifierKind === IdentifierKind.Ethereum &&
            isSameString(id.identifier, DOGFOODING_ADMIN_ADDRESS)
        )
    );
    memberInboxId = member?.inboxId;
  } catch (findMemberError: any) {
    log(`[ERROR] Failed to search for member ${DOGFOODING_ADMIN_ADDRESS} in group ${group.id}: ${findMemberError.message}`);
    return;
  }

  if (memberInboxId) {
    try {
      await group.addAdmin(memberInboxId);
      log(`[SUCCESS] Added ${DOGFOODING_ADMIN_ADDRESS} (InboxID: ${memberInboxId}) as admin to group ${group.id}`);

      // --- Remove DM Confirmation Block ---
      /*
      try {
        log(`[INFO] Sending DM confirmation to admin ${DOGFOODING_ADMIN_ADDRESS}...`);
        const adminConversation = await client.conversations.newConversation(
          DOGFOODING_ADMIN_ADDRESS
        );
        await adminConversation.send("Admin added successfully");
        log(`[SUCCESS] Sent "Admin added successfully" DM to ${DOGFOODING_ADMIN_ADDRESS}`);
      } catch (dmError: any) {
        log(`[ERROR] Failed to send confirmation DM to ${DOGFOODING_ADMIN_ADDRESS}: ${dmError.message}`);
      }
      */
      // --- End Remove DM Confirmation Block ---

    } catch (addAdminError: any) {
      log(`[ERROR] Failed to promote ${DOGFOODING_ADMIN_ADDRESS} to admin in group ${group.id}: ${addAdminError.message}`);
      return; // Exit if promoting fails
    }
  } else {
    log(
      `[WARNING] Could not find member ${DOGFOODING_ADMIN_ADDRESS} in group ${group.id} after attempting to add them. Cannot promote to admin.`
    );
  }

  log(`[SUCCESS] ${GROUP_NAME} group configuration attempt complete for group ${group.id}`);
};
