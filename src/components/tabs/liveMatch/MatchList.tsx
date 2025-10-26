import React, { useRef, useEffect } from "react";
import {
  FlatList,
  Image,
  Text,
  View,
  Animated,
  Easing,
  StyleSheet,
  // ImagePropertiesSourceOptions,
} from "react-native";

interface Match {
  id?: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamImage?: string | null;
  awayTeamImage?: string | null;
  score?: string | null;
  matchMinutes?: string | number | false;
  matchMinutesAfter90?: string | number | false;
  matchFinish?: string | boolean;
  matchAdjournment?: boolean;
  matchCancel?: boolean;
  // هر فیلد دیگه‌ای که سرور می‌فرسته
}

interface LeagueItem {
  league: string;
  leagueImage?: string;
  matchList: Match[];
}

interface Props {
  data: LeagueItem[];
}

function toPersianDigits(s: number | string | undefined | null): string {
  if (s === undefined || s === null) return "";
  return s
    .toString()
    .replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(d, 10)]);
}

const cleanScore = (score?: string | null) => {
  if (!score) return null;
  // trim and normalize spaces
  return score.trim();
};

const LivePing: React.FC<{ visible: boolean }> = ({ visible }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.6,
            duration: 800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.9,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, scale, opacity]);

  if (!visible) return null;

  return (
    <View style={styles.pingContainer} pointerEvents="none">
      {/* پینگ بزرگتر (پالس) */}
      <Animated.View
        style={[
          styles.pingPulse,
          { transform: [{ scale }], opacity: opacity as any },
        ]}
      />
      {/* دات ثابت کوچک */}
      <View style={styles.pingDot} />
    </View>
  );
};

const MatchList: React.FC<Props> = ({ data }) => {
  const renderMatch = ({ item, index, isLast }: { item: Match; index: number; isLast: boolean; }) => {
    const isLive = !!(item.matchMinutes || item.matchMinutesAfter90);
    const displayMinutes = item.matchMinutes
      ? item.matchMinutes
      : item.matchMinutesAfter90
      ? item.matchMinutesAfter90
      : null;
    const score = cleanScore(item.score) || "-";

    return (
      <View
        style={[
          styles.matchRow,
          !isLast && styles.matchRowBorder,
        ]}
      >
        {/* پینگ لایو */}
        <LivePing visible={isLive} />

        {/* میزبان */}
        <View style={styles.teamContainerRight}>
          <Text style={styles.teamText} numberOfLines={1} ellipsizeMode="tail">
            {item.homeTeam && item.homeTeam.length > 17
              ? item.homeTeam.slice(0, 14) + "…"
              : item.homeTeam}
          </Text>
          <Image
            source={ { uri: item.homeTeamImage ? item.homeTeamImage : "" } }
            style={styles.teamImage}
            resizeMode="cover"
          />
        </View>

        {/* وسط: امتیاز و دقیقه/وضعیت */}
        <View style={styles.center}>
          <Text style={styles.scoreText}>{toPersianDigits(score)}</Text>

          {item.matchFinish ? (
            // اگر matchFinish یک رشته توضیحیه (مثلاً "پایان") نمایش می‌دهیم، در غیر اینصورت "پایان" فارسی
            <Text style={styles.finishText}>
              {typeof item.matchFinish === "string" && item.matchFinish
                ? item.matchFinish
                : "پایان"}
            </Text>
          ) : item.matchAdjournment ? (
            <Text style={styles.adjournText}>تعلیق</Text>
          ) : item.matchCancel ? (
            <Text style={styles.cancelText}>لغو</Text>
          ) : displayMinutes ? (
            <Text style={styles.minuteText}>{toPersianDigits(displayMinutes)}</Text>
          ) : (
            null
          )}
        </View>

        {/* مهمان */}
        <View style={styles.teamContainerLeft}>
          <Image
            source={ { uri: item.awayTeamImage ? item.awayTeamImage : "" } }
            style={styles.teamImage}
            resizeMode="cover"
          />
          <Text style={styles.teamText} numberOfLines={1} ellipsizeMode="tail">
            {item.awayTeam && item.awayTeam.length > 18
              ? item.awayTeam.slice(0, 14) + "…"
              : item.awayTeam}
          </Text>
        </View>
      </View>
    );
  };

  const renderLeague = ({ item }: { item: LeagueItem }) => {
    const matches = item.matchList || [];

    return (
      <View style={styles.leagueCard}>
        <View style={styles.leagueHeader}>
          <Image
            source={ { uri: item.leagueImage ? item.leagueImage : "" } }
            style={styles.leagueImage}
          />
          <Text numberOfLines={1} style={styles.leagueTitle}>
            {item.league}
          </Text>
        </View>

        <FlatList
          data={matches}
          keyExtractor={(match, i) => match.id ?? `${item.league}_${i}`}
          renderItem={({ item: match, index }) =>
            renderMatch({
              item: { ...match, id: match.id ?? `${item.league}_${index}` },
              index,
              isLast: index === matches.length - 1,
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

const styles = StyleSheet.create({
  leagueCard: {
    overflow: "hidden",
    backgroundColor: "#171717",
    margin: 7,
    borderRadius: 7,
  },
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    paddingTop: 15,
    paddingHorizontal: 15,
    gap: 4,
  },
  leagueImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  leagueTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "SFArabic-Heavy",
  },

  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
    position: "relative",
  },
  matchRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },

  teamContainerRight: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  teamContainerLeft: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  teamText: {
    color: "#ddd",
    fontSize: 14,
    fontFamily: "SFArabic-Regular",
  },
  teamImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginHorizontal: 6,
  },

  center: {
    width: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    color: "#aaa",
    textAlign: "center",
    fontSize: 14,
    fontFamily: "SFArabic-Regular",
  },
  minuteText: {
    color: "#16A34A", // سبز
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  finishText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  adjournText: {
    color: "#FBBF24", // زرد
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  cancelText: {
    color: "#EF4444", // قرمز
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },

  // پینگ استایل
  pingContainer: {
    position: "absolute",
    left: 10,
    top: 8,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pingPulse: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 14 / 2,
    backgroundColor: "#10B981", // سبز مشابه کلاس
  },
  pingDot: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: "#10B981",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
});

export default MatchList;
