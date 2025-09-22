import React from "react";
import { FlatList, Image, Text, View } from "react-native";

interface Match {
  id?: string; // ممکنه از سرور نیاد، در صورت نیاز تولید می‌کنیم
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

function toPersianDigits(num: number | string): string {
  return num
    .toString()
    .replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(d)]);
}

const MatchList: React.FC<Props> = ({ data }) => {
  // رندر یک بازی (حالا isLast دریافت میکند)
  const renderMatch = ({
    item,
    index,
    isLast,
  }: {
    item: Match;
    index: number;
    isLast: boolean;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: isLast ? 0 : 1, // اگر آخرین بود border نذار
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
          style={{
            color: "#ddd",
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.homeTeam.length > 17
            ? item.homeTeam.slice(0, 14) + "…"
            : item.homeTeam}
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
          {item.score ? toPersianDigits(item.score) : "-"}
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
          style={{
            color: "#ddd",
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.awayTeam.length > 18
            ? item.awayTeam.slice(0, 14) + "…"
            : item.awayTeam}
        </Text>
      </View>
    </View>
  );

  // رندر هر لیگ همراه با لیست بازی‌ها
  const renderLeague = ({ item, index }: { item: LeagueItem; index: number }) => {
    const matches = item.matchList || [];

    return (
      <View
        style={{
          overflow: "hidden",
          backgroundColor: "#171717ff",
          margin: 7,
          borderRadius: 7,
        }}
      >
        {/* عنوان لیگ */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 8,
            paddingTop: 15,
            paddingHorizontal: 15,
            gap: 3,
          }}
        >
          <Image
            source={{ uri: item.leagueImage }}
            style={{ width: 24, height: 24, borderRadius: 6 }}
          />
          <Text
            numberOfLines={1}
            style={{ color: "#fff", fontSize: 16, fontFamily: "SFArabic-Heavy" }}
          >
            {item.league}
          </Text>
        </View>

        {/* لیست بازی‌ها */}
        <FlatList
          data={matches}
          keyExtractor={(match, i) => match.id ?? `${item.league}_${i}`}
          renderItem={({ item: match, index: idx }) =>
            renderMatch({
              item: { ...match, id: match.id ?? `${item.league}_${idx}` },
              index: idx,
              isLast: idx === matches.length - 1,
            })
          }
          scrollEnabled={false}
          removeClippedSubviews={true}
          initialNumToRender={5}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      </View>
    );
  };

  return (
    <FlatList
      data={data}
      keyExtractor={(league, i) => `${league.league}_${i}`}
      renderItem={renderLeague}
      removeClippedSubviews={true}
      initialNumToRender={2}
      maxToRenderPerBatch={5}
      windowSize={3}
    />
  );
};

export default MatchList;
