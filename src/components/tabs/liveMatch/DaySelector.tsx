import React, { useEffect, useRef } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

interface Day {
  id: number;
  title: string;
}

interface Props {
  days: Day[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  scrollX: Animated.Value; // برای انیمیشن underline
}

const ITEM_WIDTH = 100;

const DaySelector: React.FC<Props> = ({ days, selectedIndex, onSelect, scrollX }) => {
  const flatListRef = useRef<FlatList>(null);
  const screenWidth = useWindowDimensions().width;
  const sideMargin = (screenWidth - ITEM_WIDTH) / 2;

  // وقتی selectedIndex تغییر کرد، FlatList رو اسکرول می‌کنیم تا روز وسط صفحه بیاد
  useEffect(() => {
    flatListRef.current?.scrollToIndex({
      index: selectedIndex,
      animated: true,
      viewPosition: 0.5,
    });
  }, [selectedIndex]);

  const renderItem = ({ item, index }: { item: Day; index: number }) => (
    <Pressable
      onPress={() => onSelect(days.length - 1 - index)}
      style={{
        width: ITEM_WIDTH,
        alignItems: "center",
        justifyContent: "center",
        height: 50,
        borderBottomColor: "#000",
        borderBottomWidth:1
      }}
    >
      <Text
        style={{
          color: index === selectedIndex ? "#fff" : "#888",
          fontSize: 14,
          fontFamily: "SFArabic-Heavy",
        }}
      >
        {item.title}
      </Text>
    </Pressable>
  );

  // انیمیشن زیر خط (underline) که با اسکرول همگام است
  const underlineTranslateX = scrollX.interpolate({
    inputRange: [0, ITEM_WIDTH * (days.length - 1)],
    outputRange: [ITEM_WIDTH * (days.length - 1), 0],
    extrapolate: "clamp",
  });

  return (
    <View>
      <FlatList
        ref={flatListRef}
        horizontal
        data={days}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: ITEM_WIDTH,
          offset: ITEM_WIDTH * index,
          index,
        })}
        
      />

      {/* <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 2,
          width: ITEM_WIDTH,
          backgroundColor: "#fff",
          transform: [{ translateX: underlineTranslateX }],
        }}
      /> */}
    </View>
  );
};

export default DaySelector;
