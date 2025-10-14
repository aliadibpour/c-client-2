import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";

import TdLib from "react-native-tdlib";

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

export default function MessageReactions({
  reactions,
  chatId,
  messageId,
  onReact,
  customStyles,
}: Props) {
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

    // perform network/native call
    try {
      if (isRemoving) {
        await TdLib.removeMessageReaction(chatId, messageId, emoji);
      } else {
        // if previously chose another emoji, remove it first on server
        if (prevSelected) {
          await TdLib.removeMessageReaction(chatId, messageId, prevSelected);
        }
        await TdLib.addMessageReaction(chatId, messageId, emoji);
      }
      // success: nothing to do (UI already updated optimistically)
    } catch (err) {
      // rollback UI on error
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
            <Text style={[styles.emoji, customStyles?.emoji]}>
              {reaction.type.emoji}
            </Text>
            <Text style={[styles.count, customStyles?.count]}>
              {formatCount(reaction.totalCount)}
            </Text>
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
