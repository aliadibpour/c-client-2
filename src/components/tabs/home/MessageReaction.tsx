// MessageReactions.tsx (patched: offline-friendly + pending queue)
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";

import TdLib from "react-native-tdlib";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import AppText from "../../ui/AppText";

interface Reaction {
  type: { emoji: string };
  totalCount: number;
  isChosen: boolean;
}

interface CustomStyles {
  container?: ViewStyle;
  reactionBox?: ViewStyle;
  selectedBox?: ViewStyle;
  emoji?: TextStyle;
  count?: TextStyle;
}

interface Props {
  reactions: Reaction[];
  chatId: number;
  messageId: number;
  onReact?: (emoji: string | null) => void;
  customStyles?: CustomStyles;
}

const PENDING_KEY = "pending_reactions_v1";

type PendingEntry = {
  id: string;
  chatId: number;
  messageId: number;
  emoji: string;
  action: "add" | "remove";
  createdAt: number;
};

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export default function MessageReactions({
  reactions,
  chatId,
  messageId,
  onReact,
  customStyles,
}: Props) {
  const isFocused = useIsFocused();

  // local selected emoji (string) for quick checks
  const [selected, setSelected] = useState<string | null>(
    reactions.find((r) => r.isChosen)?.type.emoji || null
  );

  // local copy of reactions for optimistic updates
  const [localReactions, setLocalReactions] = useState<Reaction[]>(
    reactions.map((r) => ({ ...r }))
  );

  // sync when prop changes
  useEffect(() => {
    setSelected(reactions.find((r) => r.isChosen)?.type.emoji || null);
    setLocalReactions(reactions.map((r) => ({ ...r })));
  }, [reactions]);

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return count?.toString();
  };

  const clamp = (n: number) => Math.max(0, n | 0);

  // --- helpers for pending queue ---
  const loadPending = useCallback(async (): Promise<PendingEntry[]> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as PendingEntry[];
    } catch (e) {
      console.warn("[pending] load failed", e);
      return [];
    }
  }, []);

  const savePending = useCallback(async (list: PendingEntry[]) => {
    try {
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("[pending] save failed", e);
    }
  }, []);

  const pushPending = useCallback(
    async (entry: Omit<PendingEntry, "id" | "createdAt">) => {
      try {
        const arr = await loadPending();
        const newEntry: PendingEntry = {
          id: makeId(),
          createdAt: Date.now(),
          ...entry,
        };
        arr.push(newEntry);
        await savePending(arr);
        console.log("[pending] queued", newEntry);
      } catch (e) {
        console.warn("[pending] push failed", e);
      }
    },
    [loadPending, savePending]
  );

  // process pending queue: attempt to apply each pending entry
  const processPendingReactions = useCallback(async () => {
    try {
      let pending = await loadPending();
      if (!pending || pending.length === 0) return;
      console.log("[pending] processing", pending.length);
      const remaining: PendingEntry[] = [];

      for (const p of pending) {
        try {
          // ensure chat open
          try {
            await TdLib.openChat(p.chatId);
          } catch (e) {
            // ignore openChat failure here; we'll still attempt the action — openChat may fail for many reasons
            console.warn("[pending] openChat failed", p.chatId, e);
          }

          if (p.action === "add") {
            // remove previously chosen on server if needed is not known here; best-effort add
            await TdLib.addMessageReaction(p.chatId, p.messageId, p.emoji);
          } else {
            await TdLib.removeMessageReaction(p.chatId, p.messageId, p.emoji);
          }
          console.log("[pending] applied", p.id);
          // success -> don't requeue
        } catch (err) {
          // if fails, keep in remaining to retry later
          console.warn("[pending] apply failed, will retry later", p, err);
          remaining.push(p);
        }
      }

      // save remaining
      await savePending(remaining);
    } catch (e) {
      console.warn("[pending] processing error", e);
    }
  }, [loadPending, savePending]);

  // try to process pending on mount and when component becomes focused
  useEffect(() => {
    processPendingReactions().catch((e) => console.warn("[pending] initial process failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFocused) {
      processPendingReactions().catch((e) => console.warn("[pending] focus process failed", e));
    }
  }, [isFocused, processPendingReactions]);

  // --- main handler ---
  const handleReact = async (emoji: string) => {
    const isRemoving = selected === emoji;
    const prevSelected = selected;
    const prevState = localReactions.map((r) => ({ ...r })); // deep-ish clone for rollback

    // Optimistic update:
    const newReactions = localReactions.map((r) => {
      const rEmoji = r.type.emoji;
      // user is removing their selected reaction
      if (isRemoving && rEmoji === emoji) {
        return { ...r, totalCount: clamp(r.totalCount - 1), isChosen: false };
      }

      // user is selecting a new emoji
      if (!isRemoving) {
        if (rEmoji === emoji) {
          return { ...r, totalCount: r.totalCount + 1, isChosen: true };
        }
        // if previously selected another emoji, decrement it
        if (rEmoji === prevSelected) {
          return { ...r, totalCount: clamp(r.totalCount - 1), isChosen: false };
        }
      }

      return r;
    });

    // If emoji isn't already present in the list (rare), add it optimistically
    let finalReactions = newReactions;
    if (!newReactions.some((r) => r.type.emoji === emoji) && !isRemoving) {
      finalReactions = [
        ...newReactions,
        { type: { emoji }, totalCount: 1, isChosen: true },
      ];
    }

    // apply optimistic UI
    setLocalReactions(finalReactions);
    setSelected(isRemoving ? null : emoji);
    if (onReact) {
      try { onReact(isRemoving ? null : emoji); } catch (e) {}
    }

    // perform network/native call with smarter error handling
    try {
      if (isRemoving) {
        await TdLib.removeMessageReaction(chatId, messageId, emoji);
      } else {
        // if previously chose another emoji, remove it first on server
        if (prevSelected) {
          // attempt to remove prevSelected on server; ignore failure for now
          try { await TdLib.removeMessageReaction(chatId, messageId, prevSelected); } catch (e) { /* ignore */ }
        }
        await TdLib.addMessageReaction(chatId, messageId, emoji);
      }
      // success: nothing to do (UI already updated optimistically)
    } catch (err: any) {
      // Inspect error message to decide behavior
      const msg = String(err?.message || err || "");
      const isMessageNotFound = /message not found/i.test(msg) || /400/.test(msg) || /messageNotFound/i.test(msg);

      if (isMessageNotFound) {
        // Likely cause: chat not opened / message not available locally.
        // Keep optimistic UI, but enqueue pending operation to retry later.
        const action: PendingEntry["action"] = isRemoving ? "remove" : "add";
        pushPending({ chatId, messageId, emoji, action }).catch((e) => console.warn("[pending] push failed", e));

        // Also try to open chat and attempt an immediate retry (best-effort)
        try {
          await TdLib.openChat(chatId);
          if (isRemoving) {
            await TdLib.removeMessageReaction(chatId, messageId, emoji).catch(() => { /* ignore */ });
          } else {
            if (prevSelected) {
              await TdLib.removeMessageReaction(chatId, messageId, prevSelected).catch(() => { /* ignore */ });
            }
            await TdLib.addMessageReaction(chatId, messageId, emoji).catch(() => { /* ignore */ });
          }
        } catch (e) {
          // ignore - queued already
        }

        console.warn("[react] message not found -> queued pending reaction, optimistic UI kept", { chatId, messageId, emoji, action });
        return;
      }

      // For other errors we roll back (this is conservative; adjust if you prefer keep UI on other errors too)
      console.error("Reaction failed, rolling back:", err);
      setLocalReactions(prevState);
      setSelected(prevSelected ?? null);
      if (onReact) {
        try { onReact(prevSelected ?? null); } catch (e) {}
      }
    }
  };

  return (
    <View style={[styles.container, customStyles?.container]}>
      {localReactions.map((reaction, idx) => {
        const isSelected = selected === reaction.type.emoji;
        return (
          <TouchableOpacity
            key={reaction.type.emoji + "_" + idx}
            style={[
              styles.reactionBox,
              customStyles?.reactionBox,
              isSelected && styles.selectedBox,
              isSelected && customStyles?.selectedBox,
            ]}
            onPress={() => handleReact(reaction.type.emoji)}
            activeOpacity={0.7}
          >
            <AppText style={[styles.emoji, customStyles?.emoji]}>
              {reaction.type.emoji}
            </AppText>
            <AppText style={[styles.count, customStyles?.count]}>
              {formatCount(reaction.totalCount)}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 10,
    marginTop: 5,
    flexWrap: "wrap",
  },
  reactionBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 50,
    justifyContent: "center",
  },
  selectedBox: {
    backgroundColor: "#444",
  },
  emoji: {
    fontSize: 10,
    marginRight: 1.7,
  },
  count: {
    color: "white",
    fontSize: 13,
  },
});
