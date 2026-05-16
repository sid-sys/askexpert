"use client";

import { useEffect, useState } from "react";
import { StreamChat, Channel as StreamChannel } from "stream-chat";
import {
  Chat,
  Channel,
  Window,
  ChannelHeader,
  MessageList,
  MessageComposer,
  Thread,
} from "stream-chat-react";
import "stream-chat-react/dist/css/index.css";
import { useAuth } from "@/context/AuthContext";

// CommunityChat — embedded Stream channel for a creator's community.
//
// Mounted by both the creator (admin of their own community) and fans
// (members of communities they've joined). The /api/stream/ensure-channel
// route handles the auth check (fan must have an active subscription
// to the creator) before adding them to the channel, so this component
// can assume any connection that succeeds is authorised.
//
// We use a single shared Stream Chat app, with one channel per creator
// (`community-{creatorId}`). Channel type "community" is provisioned
// once by lib/stream.ts.
export default function CommunityChat({ creatorId }: { creatorId: string }) {
  const { user } = useAuth();
  const [client, setClient]   = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let chatClient: StreamChat | null = null;

    (async () => {
      try {
        // 1. Mint a Stream token for this Firebase user.
        const { getIdToken } = await import("firebase/auth");
        const idToken = await getIdToken(user as any);
        const tokRes = await fetch("/api/stream/token", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!tokRes.ok) throw new Error("Could not mint Stream token");
        const { token } = await tokRes.json();

        // 2. Ensure we're a member of the channel (idempotent).
        const ensureRes = await fetch("/api/stream/ensure-channel", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ creatorId }),
        });
        if (!ensureRes.ok) {
          const data = await ensureRes.json().catch(() => ({}));
          throw new Error(data.error || "Could not join community");
        }

        if (!active) return;

        // 3. Connect.
        const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
        if (!apiKey) throw new Error("Missing Stream API key");
        chatClient = StreamChat.getInstance(apiKey);
        await chatClient.connectUser(
          { id: user.uid, name: user.displayName || user.email || "User" },
          token,
        );

        if (!active) {
          await chatClient.disconnectUser();
          return;
        }

        const ch = chatClient.channel("community", `community-${creatorId}`);
        await ch.watch();
        if (!active) {
          await chatClient.disconnectUser();
          return;
        }

        setClient(chatClient);
        setChannel(ch);
      } catch (e: any) {
        if (active) setError(e?.message || "Failed to load community");
      }
    })();

    return () => {
      active = false;
      // Disconnect on unmount so we don't leak a websocket.
      chatClient?.disconnectUser().catch(() => {});
    };
  }, [user, creatorId]);

  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
        Please sign in to view this community.
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>⚠️</div>
        <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>
      </div>
    );
  }

  if (!client || !channel) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontFamily: "'Outfit',sans-serif" }}>
        Loading community…
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 120px)", minHeight: 480 }}>
      <Chat client={client} theme="str-chat__theme-light">
        <Channel channel={channel}>
          <Window>
            <ChannelHeader />
            <MessageList />
            <MessageComposer />
          </Window>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
}
