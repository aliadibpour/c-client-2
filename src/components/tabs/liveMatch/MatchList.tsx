

// ===== File: MatchList.tsx =====
import React, { useCallback } from "react";
import { FlatList, Image, Text, View, StyleSheet } from "react-native";

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
}

interface LeagueItem {
  league: string;
  leagueImage?: string;
  matchList: Match[];
}

interface Props {
  data: LeagueItem[] | Match[]; // we accept either when using this as a per-day list or per-league
  listRef?: (r: FlatList<any> | null) => void;
  extraDataForList?: any;
}

function toPersianDigits(s: number | string | undefined | null): string {
  if (s === undefined || s === null) return "";
  return s.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(d, 10)]);
}

const cleanScore = (score?: string | null) => {
  if (!score) return null;
  return score.trim();
};

// ===== MatchRow as a memoized component =====
const MatchRowInner: React.FC<{ item: Match; isLast: boolean }> = ({ item, isLast }) => {
  const isLive = !!(item.matchMinutes || item.matchMinutesAfter90);
  const displayMinutes = item.matchMinutes
    ? item.matchMinutes
    : item.matchMinutesAfter90
    ? item.matchMinutesAfter90
    : null;
  const score = cleanScore(item.score) || "-";

  return (
    <View style={[styles.matchRow, !isLast && styles.matchRowBorder]}>
      <View style={styles.pingContainer} pointerEvents="none">
        {isLive ? (
          <>
            <View style={styles.pingPulse} />
            <View style={styles.pingDot} />
          </>
        ) : null}
      </View>

      <View style={styles.teamContainerRight}>
        <Text style={styles.teamText} numberOfLines={1} ellipsizeMode="tail">
          {item.homeTeam && item.homeTeam.length > 17 ? item.homeTeam.slice(0, 14) + "…" : item.homeTeam}
        </Text>
        <Image source={{ uri: item.homeTeamImage ? item.homeTeamImage : "" }} style={styles.teamImage} resizeMode="cover" />
      </View>

      <View style={styles.center}>
        <Text style={styles.scoreText}>{toPersianDigits(score)}</Text>

        {item.matchFinish ? (
          <Text style={styles.finishText}>{typeof item.matchFinish === "string" && item.matchFinish ? item.matchFinish : "پایان"}</Text>
        ) : item.matchAdjournment ? (
          <Text style={styles.adjournText}>تعلیق</Text>
        ) : item.matchCancel ? (
          <Text style={styles.cancelText}>لغو</Text>
        ) : displayMinutes ? (
          <Text style={styles.minuteText}>{toPersianDigits(displayMinutes)}</Text>
        ) : null}
      </View>

      <View style={styles.teamContainerLeft}>
        <Image source={{ uri: item.awayTeamImage ? item.awayTeamImage : "" }} style={styles.teamImage} resizeMode="cover" />
        <Text style={styles.teamText} numberOfLines={1} ellipsizeMode="tail">
          {item.awayTeam && item.awayTeam.length > 18 ? item.awayTeam.slice(0, 14) + "…" : item.awayTeam}
        </Text>
      </View>
    </View>
  );
};

function matchRowAreEqual(prevProps: any, nextProps: any) {
  const a = prevProps.item;
  const b = nextProps.item;
  if (a.id !== b.id) return false;
  const keys = [
    "score",
    "matchMinutes",
    "matchMinutesAfter90",
    "matchFinish",
    "matchAdjournment",
    "matchCancel",
  ];
  for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  return prevProps.isLast === nextProps.isLast;
}

const MatchRow = React.memo(MatchRowInner, matchRowAreEqual);

// ===== If data is LeagueItem[] we render league cards, otherwise if it's Match[] we render matches directly =====
const MatchList: React.FC<Props> = ({ data, listRef, extraDataForList }) => {
  const isLeagueList = Array.isArray(data) && data.length > 0 && (data[0] as any).league !== undefined;

  if (!isLeagueList) {
    // data is Match[] for a single league/day
    const matches = (data as Match[]) || [];
    const renderMatchItem = useCallback(
      ({ item, index }: { item: Match; index: number }) => {
        const isLast = index === matches.length - 1;
        return <MatchRow item={item} isLast={isLast} />;
      },
      [matches.length]
    );

    return (
      <FlatList
        ref={listRef}
        data={matches}
        keyExtractor={(m, i) => m.id ?? `match_${i}`}
        renderItem={renderMatchItem}
        scrollEnabled={true}
        removeClippedSubviews={true}
        initialNumToRender={5}
        maxToRenderPerBatch={10}
        windowSize={5}
        extraData={extraDataForList}
      />
    );
  }

  // it's LeagueItem[]
  const renderLeague = useCallback(
    ({ item, index }: { item: LeagueItem; index: number }) => {
      const matches = item.matchList || [];
      const renderMatchItem = ({ item: match, index: mIndex }: { item: Match; index: number }) => (
        <MatchRow item={{ ...match, id: match.id ?? `${item.league}_${mIndex}` }} isLast={mIndex === matches.length - 1} />
      );

      return (
        <View style={styles.leagueCard}>
          <View style={styles.leagueHeader}>
            <Image source={{ uri: item.leagueImage ? item.leagueImage : "" }} style={styles.leagueImage} />
            <Text numberOfLines={1} style={styles.leagueTitle}>
              {item.league}
            </Text>
          </View>

          <FlatList
            data={matches}
            keyExtractor={(match, i) => match.id ?? `${item.league}_${i}`}
            renderItem={renderMatchItem}
            scrollEnabled={false}
            removeClippedSubviews={true}
            initialNumToRender={5}
            maxToRenderPerBatch={10}
            windowSize={5}
            extraData={extraDataForList}
          />
        </View>
      );
    },
    [extraDataForList]
  );

  return (
    <FlatList
      data={data as LeagueItem[]}
      keyExtractor={(league, i) => `${league.league}_${i}`}
      renderItem={renderLeague}
      removeClippedSubviews={true}
      initialNumToRender={2}
      maxToRenderPerBatch={5}
      windowSize={3}
      extraData={extraDataForList}
      ref={listRef}
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
    color: "#16A34A",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  finishText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  adjournText: {
    color: "#FBBF24",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  cancelText: {
    color: "#EF4444",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },

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
    backgroundColor: "#10B981",
    opacity: 0.5,
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
