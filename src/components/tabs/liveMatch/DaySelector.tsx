import React from "react";
import { FlatList, Pressable, Text } from "react-native";

interface Day {
  id: number;
  title: string;
}

interface Props {
  days: Day[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const DaySelector: React.FC<Props> = ({ days, selectedIndex, onSelect }) => {
  return (
    <FlatList
      horizontal
      data={days}
      keyExtractor={(item) => item.id.toString()}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10, borderWidth:1, borderBottomColor: "#222", marginBottom: 20 }}
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => onSelect(index)}
          style={{
            marginRight: 14,
            paddingVertical: 8,
            paddingHorizontal: 32,
            height: 42,
            justifyContent: "center",
            // borderWidth: 1,
            // borderBottomColor: selectedIndex == 2 ? "#555" : "#222"
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
            {item.title}
          </Text>
        </Pressable>
      )}
    />
  );
};

export default DaySelector;
