import React from "react";
import { FlatList, Image, Text, View } from "react-native";

interface Match {
  id: string; // حتما id یکتا برای هر بازی داشته باش
  homeTeam: string;
  awayTeam: string;
  homeTeamImage: string;
  awayTeamImage: string;
  score?: string;
}

interface LeagueItem {
  league: string;
  leagueImage: string;
  matchList: Match[];
}

interface Props {
  data: LeagueItem[];
}

const MatchList: React.FC<Props> = ({ data }) => {
  // رندر هر بازی
  const renderMatch = ({ item, index }: { item: Match; index: number }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: index !== data.length - 1 ? 1 : 0,
        borderColor: "#111",
        marginBottom: 8,
      }}
    >
      {/* تیم میزبان */}
      <View
        style={{
          flex: 2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Text
          style={{ color: "#ddd", fontSize: 14, fontFamily: "SFArabic-Regular" }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.homeTeam.length > 17 ? item.homeTeam.slice(0, 14) + "…" : item.homeTeam}
        </Text>
        <Image
          source={{ uri: item.homeTeamImage }}
          style={{ width: 25, height: 25, borderRadius: 6, marginLeft: 4 }}
        />
      </View>

      {/* امتیاز */}
      <View style={{ width: 40, marginHorizontal: 15 }}>
        <Text
          style={{
            color: "#aaa",
            textAlign: "center",
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
          }}
        >
          {item.score || "-"}
        </Text>
      </View>

      {/* تیم مهمان */}
      <View
        style={{
          flex: 2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <Image
          source={{ uri: item.awayTeamImage }}
          style={{ width: 25, height: 25, borderRadius: 6, marginRight: 4 }}
        />
        <Text
          style={{ color: "#ddd", fontSize: 14, fontFamily: "SFArabic-Regular" }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.awayTeam.length > 18 ? item.awayTeam.slice(0, 14) + "…" : item.awayTeam}
        </Text>
      </View>
    </View>
  );

  // رندر هر لیگ همراه با لیست بازی‌ها
  const renderLeague = ({ item }: { item: LeagueItem }) => (
    <View style={{ overflow: "hidden" }}>
      {/* عنوان لیگ */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#111",
          padding: 8,
          paddingHorizontal: 15,
        }}
      >
        <Image
          source={{ uri: item.leagueImage }}
          style={{ width: 24, height: 24, marginRight: 8, borderRadius: 6 }}
        />
        <Text style={{ color: "#fff", fontSize: 16, fontFamily: "SFArabic-Heavy" }}>
          {item.league}
        </Text>
      </View>

      {/* لیست بازی‌ها */}
      <FlatList
        data={item.matchList}
        keyExtractor={(match) => match.id}
        renderItem={renderMatch}
        scrollEnabled={false} // غیرفعال کردن اسکرول داخلی
        removeClippedSubviews={true}
        initialNumToRender={5}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  );

  return (
    <FlatList
      data={data}
      keyExtractor={(league) => league.league}
      renderItem={renderLeague}
      removeClippedSubviews={true}
      initialNumToRender={2}
      maxToRenderPerBatch={5}
      windowSize={3}
    />
  );
};

export default MatchList;
