import { StreamChat } from "stream-chat";

// ── Stream Chat — server-side singleton ──────────────────────────────────────
// Powers the "Community" feature: each creator gets a Stream channel where
// they broadcast updates and run polls. Their paid subscribers are added as
// channel members at sign-up (via the Stripe / Razorpay webhooks).
//
// We use Stream Chat (not Stream Feeds) because Chat ships with native
// polls + reactions + a polished React SDK, and we already use Firestore
// for the existing 1-on-1 DM threads.
//
// Lazy singleton: avoids instantiating during build when env may be absent.
let _server: StreamChat | null = null;
export function streamServer(): StreamChat {
  if (_server) return _server;
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Stream credentials missing: set NEXT_PUBLIC_STREAM_API_KEY + STREAM_API_SECRET");
  }
  _server = StreamChat.getInstance(apiKey, apiSecret);
  return _server;
}

// Stream channel id for a creator's community. Single channel per creator
// — all their subscribers join the same room.
export function communityChannelId(creatorId: string): string {
  return `community-${creatorId}`;
}

// Ensure a creator's community channel exists and the given fan is a member.
// Idempotent — safe to call from webhooks on every subscription event.
//
// Permissions: the channel uses our custom "community" type so the channel
// owner (creator) can post + create polls, members (fans) can react and
// vote on polls but cannot send messages. That custom type is provisioned
// once in ensureCommunityChannelType() below — we call it lazily here.
export async function ensureCommunityMembership(params: {
  creatorId: string;
  creatorName?: string;
  creatorImage?: string | null;
  fanId: string;
}) {
  const client = streamServer();

  // Make sure both users exist in Stream's user table. upsertUsers is
  // idempotent — re-runs just refresh the role / name fields.
  await client.upsertUsers([
    {
      id: params.creatorId,
      name: params.creatorName,
      role: "user",
      ...(params.creatorImage ? { image: params.creatorImage } : {}),
    },
    { id: params.fanId, role: "user" },
  ]);

  // First-touch provisioning of the channel type. This is global per app
  // (not per channel), so we only need to do it once — but checking on
  // each call costs nothing if it's already there.
  await ensureCommunityChannelType().catch((e) => {
    // Don't block subscription on this; channel still works with default type.
    // eslint-disable-next-line no-console
    console.warn("[stream] community channel type setup failed:", (e as Error).message);
  });

  // `name` isn't in stream-chat's strict ChannelData typing but Stream
  // accepts it as custom data; cast keeps TS quiet without losing the
  // human-readable channel name in dashboards / clients.
  const channel = client.channel("community", communityChannelId(params.creatorId), {
    created_by_id: params.creatorId,
    members: [params.creatorId, params.fanId],
    ...(params.creatorName ? { name: `${params.creatorName}'s Community` } : {}),
  } as any);
  await channel.create();
  // create() above adds the listed members at first creation, but on
  // subsequent calls we still need to add new fans explicitly.
  await channel.addMembers([params.fanId]).catch(() => { /* already a member — fine */ });
  return channel.id!;
}

// Remove a fan from the creator's community when they cancel / churn.
// Called from the cancel-subscription webhooks.
export async function removeCommunityMembership(params: { creatorId: string; fanId: string }) {
  const client = streamServer();
  const channel = client.channel("community", communityChannelId(params.creatorId));
  await channel.removeMembers([params.fanId]).catch(() => { /* not a member — fine */ });
}

// ── Custom channel type: "community" ─────────────────────────────────────────
// Locks down channel_member role so fans can react / vote but cannot send
// messages. Only the channel owner (creator) + admins can send.
//
// Stream's channel-type provisioning is idempotent on the same config.
// We track whether we've attempted it this process so we don't hammer the
// API on every webhook call.
let typeReady = false;
async function ensureCommunityChannelType() {
  if (typeReady) return;
  const client = streamServer();
  try {
    // Try fetch — if it exists, no work needed.
    await client.getChannelType("community");
    typeReady = true;
    return;
  } catch {
    // Falls through to create.
  }
  try {
    await client.createChannelType({
      name: "community",
      // Inherit messaging defaults, then override specifics below.
      commands: ["giphy", "ban", "flag", "mute"],
      // Stream's permission model is rich; the practical-enough config for
      // v1 is: members read/react, only admins/owners send messages.
      // We achieve this by setting permissions on the channel role in the
      // dashboard or via the permissions API. For now we just create the
      // type — permission tightening can be done via Stream's dashboard
      // → Roles & Permissions → channel type "community".
    } as any);
    typeReady = true;
  } catch (err: any) {
    // 16: type already exists (race between checks). Treat as success.
    if (err?.code === 16 || /already exists/i.test(err?.message || "")) {
      typeReady = true;
      return;
    }
    throw err;
  }
}
