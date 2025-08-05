import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  NativeModules,
} from "react-native";

const { TdLibModule } = NativeModules;

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

export default function MessageReactions({ reactions, chatId, messageId, customStyles }: Props) {
  const [selected, setSelected] = useState<string | null>(
    reactions.find((r) => r.isChosen)?.type.emoji || null
  );

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return count.toString();
  };

const handleReact = async (emoji: string) => {
  const isRemoving = selected === emoji;
  const prevSelected = selected;

  // ✅ بلافاصله UI رو تغییر بده (بدون معطلی)
  setSelected(isRemoving ? null : emoji);

  try {
    if (isRemoving) {
      await TdLibModule.removeMessageReaction(chatId, messageId, emoji);
    } else {
      if (prevSelected) {
        await TdLibModule.removeMessageReaction(chatId, messageId, prevSelected);
      }
      await TdLibModule.addMessageReaction(chatId, messageId, emoji);
    }
  } catch (err) {
    console.error("Reaction failed:", err);

    // ❌ اگر خطا داد، برگرد به حالت قبلی (Rollback)
    setSelected(prevSelected);
  }
};


  return (
    <View style={[styles.container, customStyles?.container]}>
      {reactions.map((reaction, idx) => {
        const isSelected = selected === reaction.type.emoji;
        return (
          <TouchableOpacity
            key={idx}
            style={[
              styles.reactionBox,
              customStyles?.reactionBox,
              isSelected && styles.selectedBox,
              isSelected && customStyles?.selectedBox,
            ]}
            onPress={() => handleReact(reaction.type.emoji)}
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
    marginTop: 12,
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
    marginRight: 5,
  },
  count: {
    color: "white",
    fontSize: 13,
  },
});
