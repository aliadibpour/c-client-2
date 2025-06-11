// components/MessageReactions.tsx
import { View, Text, StyleSheet } from "react-native";

interface Reaction {
  type: { emoji: string };
  totalCount: number;
  isChosen: boolean;
}

export default function MessageReactions({ reactions }: { reactions: Reaction[] }) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <View style={styles.container}>
      {reactions.map((reaction, index) => (
        <View
          key={index}
          style={[
            styles.reactionBox,
            reaction.isChosen && styles.chosenReaction,
          ]}
        >
          <Text style={styles.emoji}>{reaction.type.emoji}</Text>
          <Text style={styles.count}>{reaction.totalCount}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  reactionBox: {
    flexDirection: "row",
    backgroundColor: "#222",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: "center",
  },
  chosenReaction: {
    backgroundColor: "#444",
  },
  emoji: {
    fontSize: 14,
    marginRight: 3,
  },
  count: {
    color: "white",
    fontSize: 13,
  },
});
