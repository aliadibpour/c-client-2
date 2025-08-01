import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";

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
  onReact?: (emoji: string) => void;
  customStyles?: CustomStyles;
}

export default function MessageReactions({ reactions, onReact, customStyles }: Props) {
  const [selected, setSelected] = useState<string | null>(
    reactions.find((r) => r.isChosen)?.type.emoji || null
  );

  const formatCount = (count: number) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return count.toString();
  };

  const handleReact = (emoji: string) => {
    setSelected(emoji);
    onReact?.(emoji);
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
    backgroundColor: "#777",
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
