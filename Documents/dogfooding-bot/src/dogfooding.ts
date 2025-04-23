import { Client, IdentifierKind, type Group } from "@xmtp/node-sdk";
import { log, isSameString } from "./helpers/utils.js";

const GROUP_NAME = "TBA Dogfooding";
const DOGFOODING_ADMIN_ADDRESS = "0x80245b9C0d2Ef322F2554922cA86Cf211a24047F";

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

  await addAdminToGroup(newGroup);
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

const addAdminToGroup = async (group: Group) => {
  if (!DOGFOODING_ADMIN_ADDRESS) {
    log(`[ERROR] DOGFOODING_ADMIN_ADDRESS is not set`);
    return;
  }

  log(`[INFO] Adding admin ${DOGFOODING_ADMIN_ADDRESS} to group...`);

  await group.addMembersByIdentifiers([
    {
      identifier: DOGFOODING_ADMIN_ADDRESS,
      identifierKind: IdentifierKind.Ethereum,
    },
  ]);

  const member = (await group.members()).find(
    (member: {
      accountIdentifiers: Array<{
        identifierKind: number;
        identifier: string;
      }>;
      inboxId: string;
    }) =>
      member.accountIdentifiers.some(
        (id) =>
          id.identifierKind === IdentifierKind.Ethereum &&
          isSameString(id.identifier, DOGFOODING_ADMIN_ADDRESS)
      )
  );

  if (member) {
    await group.addAdmin(member.inboxId);
    log(`[SUCCESS] Added ${DOGFOODING_ADMIN_ADDRESS} as admin`);
  } else {
    log(
      `[WARNING] Could not find member ${DOGFOODING_ADMIN_ADDRESS} to add as admin`
    );
  }

  log(`[SUCCESS] ${GROUP_NAME} group configuration complete`);
  return group;
};
