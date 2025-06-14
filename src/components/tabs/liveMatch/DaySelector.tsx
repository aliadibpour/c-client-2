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
      contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10 }}
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => onSelect(index)}
          style={{
            marginRight: 12,
            paddingVertical: 8,
            paddingHorizontal: 18,
            borderRadius: 10,
            height: 42,
            justifyContent: "center",
            backgroundColor: index === selectedIndex ? "#666" : "#2c2c2e",
            borderWidth: index === selectedIndex ? 0 : 1,
            borderColor: "#444",
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
