import React from "react";
import { Image, Text, View } from "react-native";

interface Match {
  homeTeam: string;
  awayTeam: string;
  homeTeamImage: string;
  awayTeamImage: string;
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
  return (
    <>
      {data.map((leagueItem, index) => (
        <View key={index} style={{ overflow: "hidden" }}>
          {/* League Title */}
          <View style={{ flexDirection: "row", alignItems: "center",
             backgroundColor: "#111", padding: 8, paddingHorizontal:15 }}>
            <Image
              source={{ uri: leagueItem.leagueImage }}
              style={{ width: 24, height: 24, marginRight: 8, borderRadius: 6 }}
            />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
              {leagueItem.league}
            </Text>
          </View>

          {/* Matches */}
          <View style={{padding: 10 }}>
            {leagueItem.matchList.map((match: any, i) => (
            <View
                key={i}
                style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: i !== leagueItem.matchList.length - 1 ? 1 : 0,
                borderColor: "#111",
                marginBottom: 8
                }}
            >
                {/* Home team name + image */}
                <View style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Text
                    style={{ color: "#ddd", fontSize: 14 }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {match.homeTeam.length > 17
                    ? match.homeTeam.slice(0, 14) + "…"
                    : match.homeTeam}
                </Text>
                <Image
                    source={{ uri: match.homeTeamImage }}
                    style={{ width: 25, height: 25, borderRadius: 6, marginLeft: 4 }}
                />
                </View>

                {/* Score */}
                <View style={{ width: 40, marginHorizontal:15 }}>
                <Text style={{ color: "#aaa", textAlign: "center", fontSize: 14 }}>
                    {match.score || "-"}
                </Text>
                </View>

                {/* Away team image + name */}
                <View
                style={{
                    flex: 2,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-start",
                }}
                >
                <Image
                    source={{ uri: match.awayTeamImage }}
                    style={{ width: 25, height: 25, borderRadius: 6, marginRight: 4 }}
                />
                <Text
                    style={{ color: "#ddd", fontSize: 14 }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                     {match.awayTeam.length > 18
                        ? match.awayTeam.slice(0, 14) + "…"
                        : match.awayTeam}
                </Text>
                </View>
            </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
};

export default MatchList;
