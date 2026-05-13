"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/types";
import ChatThread, { useChatPreview } from "@/components/ChatThread";

type Subscriber = {
  id: string;
  followerId: string | null;
  followerEmail: string;
  followerName: string | null;
  status: string;
  pricePerMonth: number;
  currency: string;
  createdAt: Date;
  cancelledAt: Date | null;
  stripeSubscriptionId: string | null;
};

function displayNameFor(s: Subscriber, fallbackProfileName?: string): string {
  const name = s.followerName?.trim();
  if (name) return name;
  if (fallbackProfileName?.trim()) return fallbackProfileName.trim();
  // Last resort: use the local part of the email so we have a stable label,
  // not a masked one — the creator is supposed to see who their fans are.
  if (s.followerEmail) return s.followerEmail.split("@")[0] || s.followerEmail;
  return "Fan";
}

// Cached profile-side data we pull from the users collection for each
// subscriber so the chat header can show their actual name + last-seen.
type FanMeta = { name?: string; lastSeen?: Date | null; isOnline?: boolean };

function fanStatusLine(meta: FanMeta | undefined): string {
  if (!meta) return "";
  if (meta.isOnline) return "Online now";
  if (!meta.lastSeen) return "Offline";
  const diff = Date.now() - meta.lastSeen.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `Last seen ${days}d ago`;
  return `Last seen ${meta.lastSeen.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function FansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // followerId -> profile metadata (displayName, online status, last seen)
  // pulled from the users collection. Filled lazily on first render of each
  // subscriber so we don't fan out reads on mount.
  const [profileMeta, setProfileMeta] = useState<Record<string, FanMeta>>({});
  // Single-pane mobile switching: track viewport width so we render either the
  // chat list OR the active thread, not both, on small screens. Uses the same
  // 900px breakpoint as the global Sidebar + BottomNav (they collapse to the
  // mobile bottom nav at ≤ 900px), so the chat goes single-pane in lockstep.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Bind the whole document tree to the viewport while on /fans so the chat
  // + list each own their own independent scroll regions. Without this lock,
  // app-shell's `min-height: 100vh` lets a long fan list push the body taller
  // than the viewport, the page scrolls, and both panes drift together.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const shell = document.querySelector(".app-shell") as HTMLElement | null;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      shellHeight: shell?.style.height ?? "",
      shellOverflow: shell?.style.overflow ?? "",
    };
    html.style.overflow = "hidden";
    html.style.height = "100dvh";
    body.style.overflow = "hidden";
    body.style.height = "100dvh";
    if (shell) {
      shell.style.height = "100dvh";
      shell.style.overflow = "hidden";
    }
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      if (shell) {
        shell.style.height = prev.shellHeight;
        shell.style.overflow = prev.shellOverflow;
      }
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    const q = query(
      collection(db, COLLECTIONS.SUBSCRIPTIONS),
      where("creatorId", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Subscriber[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          followerId: data.followerId ?? null,
          followerEmail: data.followerEmail ?? "",
          followerName: data.followerName ?? null,
          status: data.status ?? "active",
          pricePerMonth: data.pricePerMonth ?? 0,
          currency: data.currency ?? "usd",
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          cancelledAt: data.cancelledAt?.toDate?.() ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
        };
      }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setSubscribers(list);
      setFetching(false);
    }, () => setFetching(false));
    return () => unsub();
  }, [user]);

  // Lazily look up displayName + last-seen for every subscriber we have a
  // followerId for. Re-reads the doc each time the subscriber list changes
  // so the chat header reflects the fan's most recent online state without
  // forcing a live subscription per fan.
  useEffect(() => {
    const targets = subscribers.filter(s => s.followerId && !profileMeta[s.followerId!]);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, FanMeta> = {};
      for (const s of targets) {
        try {
          const snap = await getDoc(doc(db, COLLECTIONS.USERS, s.followerId!));
          if (!snap.exists()) continue;
          const data = snap.data() as any;
          const name = data.displayName?.trim() || data.username?.trim() || undefined;
          const lastSeen = data.lastSeen?.toDate?.() ?? null;
          const isOnline = !!data.isOnline;
          updates[s.followerId!] = { name, lastSeen, isOnline };
        } catch { /* ignore */ }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setProfileMeta(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [subscribers, profileMeta]);

  // On mobile we want the fans list to be the landing view — chat only opens
  // after an explicit tap. Auto-fallback to the first subscriber stays on
  // desktop so the right pane is never empty.
  const selected = useMemo(() => {
    const match = subscribers.find((s) => s.id === selectedId) ?? null;
    if (match) return match;
    if (isMobile) return null;
    return subscribers[0] ?? null;
  }, [subscribers, selectedId, isMobile]);

  const activeCount = subscribers.filter((s) => s.status === "active").length;
  const totalMRR = subscribers
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + (s.pricePerMonth || 0), 0);

  if (loading || (fetching && subscribers.length === 0)) {
    return (
      <div style={{ background: "#f7f7f8", minHeight: "100vh", padding: 40 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ height: 36, width: 200, background: "#ededee", borderRadius: 8, marginBottom: 18 }} />
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
            <div style={{ height: 400, background: "#ededee", borderRadius: 16 }} />
            <div style={{ height: 400, background: "#ededee", borderRadius: 16 }} />
          </div>
        </div>
      </div>
    );
  }

  // On mobile we collapse to a single pane and toggle based on selection.
  const mobileInChat = isMobile && selected !== null;
  const showList = !isMobile || !mobileInChat;
  const showChat = !isMobile || mobileInChat;

  return (
    <div className="dash-page" style={{ background: "#f7f7f8", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Edge-to-edge layout on desktop so the chat behaves like a messaging
          app — no outer padding, the two panes butt right up against the
          sidebar and right edge of the viewport. The flex column + flex:1 on
          the grid means the chat fills exactly the remaining height with no
          empty gap below the input bar, regardless of whether the global
          NavBar is visible. */}
      <div style={{ flex: 1, minHeight: 0, maxWidth: "100%", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {subscribers.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: "60px 24px", textAlign: "center", margin: 24 }}>
            <div style={{ fontSize: "3rem", marginBottom: 14 }}>🌱</div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, color: "#111", margin: "0 0 6px", fontSize: "1.2rem" }}>No subscribers yet</h2>
            <p style={{ color: "#6b7280", margin: 0, fontSize: "0.92rem" }}>
              Share your profile link and your first fan will appear here.
            </p>
          </div>
        ) : (
          <div className="fans-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 360px) 1fr", gap: 0, alignItems: "stretch", flex: 1, minHeight: 0 }}>
            {/* LEFT: subscriber list */}
            {showList && (
              <aside style={{ background: "#fff", borderRight: "1px solid #f0f0f0", padding: 8, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
                <div style={{
                  // flex:1 + min-height:0 is required so this scroller can
                  // shrink below its content height and trigger its own
                  // scrollbar instead of growing the aside. overscroll-behavior
                  // contains wheel/touch gestures so they don't bubble out to
                  // the chat pane next door.
                  flex: 1, minHeight: 0,
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch" as any,
                }}>
                  {subscribers.map((s) => {
                    const isActive = !isMobile && (selected?.id ?? null) === s.id;
                    const name = displayNameFor(s, s.followerId ? profileMeta[s.followerId]?.name : undefined);
                    return (
                      <SubscriberRow
                        key={s.id}
                        sub={s}
                        name={name}
                        active={isActive}
                        onClick={() => setSelectedId(s.id)}
                      />
                    );
                  })}
                </div>
              </aside>
            )}

            {/* RIGHT: chat thread */}
            {showChat && (
              <section style={mobileInChat ? {
                // Full-viewport overlay (covers page chrome including the
                // bottom-nav). Z-index sits above .mobile-bottom-nav (z 100k).
                position: "fixed",
                top: 0, left: 0, right: 0, bottom: 0,
                background: "#f7f7f8",
                zIndex: 100002,
              } : { height: "100%", minHeight: 0 }}>
                {selected && selected.followerId ? (
                  <ChatThread
                    subscriptionId={selected.id}
                    creatorId={user!.uid}
                    followerId={selected.followerId}
                    viewerRole="creator"
                    counterpartName={displayNameFor(selected, profileMeta[selected.followerId]?.name)}
                    counterpartSubtitle={fanStatusLine(profileMeta[selected.followerId])}
                    height={mobileInChat ? "100%" : "100%"}
                    flush={!mobileInChat}
                    onBack={isMobile ? () => setSelectedId(null) : undefined}
                  />
                ) : selected ? (
                  <div style={{ background: "#fff", padding: 40, textAlign: "center", color: "#6b7280", height: "100%", display: "grid", placeItems: "center" }}>
                    This subscriber signed up without an account, so chat isn't available yet.
                  </div>
                ) : (
                  <div style={{ background: "#fff", padding: 40, textAlign: "center", color: "#9ca3af", height: "100%", display: "grid", placeItems: "center" }}>
                    Pick a subscriber to start a chat.
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.fans-grid) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function timeAgoShort(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SubscriberRow({
  sub, name, active, onClick,
}: {
  sub: Subscriber;
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  const { unread, lastSnippet, lastAt, lastFromMe } = useChatPreview(sub.id, "creator");
  const hasUnread = unread > 0 && !active;
  // Preview line: last message snippet when we have one, otherwise a price /
  // status hint so the row never feels empty.
  const previewText = lastSnippet
    ? `${lastFromMe ? "You: " : ""}${lastSnippet}`
    : `$${(sub.pricePerMonth / 100).toFixed(2)}/mo · ${sub.status === "active" ? "Active" : "Cancelled"}`;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "12px 14px", border: "none",
        background: active ? "#f5f3ff" : "transparent",
        borderRadius: 12, cursor: "pointer", textAlign: "left",
        marginBottom: 2,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#fafafa"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: sub.status === "active" ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#d1d5db", color: "#fff", display: "grid", placeItems: "center", fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "1rem" }}>
          {name[0].toUpperCase()}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: hasUnread ? 800 : 700, color: "#1f2937", fontSize: "0.92rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{name}</span>
          {lastAt && (
            <span style={{ fontFamily: "'Outfit',sans-serif", color: hasUnread ? "#ef4444" : "#9ca3af", fontSize: "0.7rem", fontWeight: hasUnread ? 700 : 500, flexShrink: 0 }}>
              {timeAgoShort(lastAt)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", color: hasUnread ? "#1f2937" : "#6b7280", fontSize: "0.78rem", fontWeight: hasUnread ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
            {previewText}
          </span>
          {hasUnread && (
            <span style={{ minWidth: 18, height: 18, padding: "0 6px", borderRadius: 99, background: "#ef4444", color: "#fff", fontSize: "0.66rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
