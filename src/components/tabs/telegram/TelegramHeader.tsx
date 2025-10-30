// TelegramHeader.tsx
import React from "react";
import { View, Text, Image, StyleSheet, StatusBar } from "react-native";

export const teamRecord: Record<string, string> = {
  'پرسپولیس': 'perspolis',
  'استقلال': 'esteghlal',
  'سپاهان': 'sepahan',
  'تراکتور': 'tractor',
  'بارسلونا': 'barcelona',
  'رئال مادرید': 'realmadrid',
  'آرسنال': 'arsenal',
  'منچستر یونایتد': 'manchesterunited',
  'لیورپول': 'liverpool',
  'چلسی': 'chelsea',
  'بایرن': 'bayern',
  'اینتر': 'inter',
  'میلان': 'milan',
};

type FavoriteTeams = {
  team1?: string | null;
  team2?: string | null;
  team3?: string | null;
};

type Props = {
  onTeamChange?: (teamPersian: string) => void;
  initialTeam?: string;
  favoriteTeams?: FavoriteTeams; // فارسی شده (نام تیم‌های مورد علاقه)
};

/**
 * Header ساده:
 * - دیگر تب اسکرولی ندارد.
 * - فقط لوگو و عنوان و نمایشِ خلاصه‌ی تیم‌های مورد علاقه (در صورت وجود).
 * - header دیگر onTeamChange را به صورت خودکار در mount صدا نمی‌زند؛ تغییر تیم باید از بیرون (Screen) مدیریت شود.
 */
const TelegramHeader: React.FC<Props> = ({ favoriteTeams }) => {
  const favText = (() => {
    if (!favoriteTeams) return "";
    const parts: string[] = [];
    if (favoriteTeams.team1) parts.push(`تیم ۱: ${favoriteTeams.team1}`);
    else parts.push(`تیم ۱: null`);
    if (typeof favoriteTeams.team2 !== "undefined") parts.push(`تیم ۲: ${favoriteTeams.team2 ?? "null"}`);
    if (typeof favoriteTeams.team3 !== "undefined") parts.push(`تیم ۳: ${favoriteTeams.team3 ?? "null"}`);
    return parts.join(" — ");
  })();

  return (
    <View style={styles.headerContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Image source={require("../../../assets/images/corner-logo.png")} style={styles.logo} />
    </View>
  );
};

export default TelegramHeader;

const styles = StyleSheet.create({
  headerContainer: {
    borderColor: "#111",
    borderBottomWidth: 0.7,
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#000",
    flexDirection: "row",
    justifyContent: "center"
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 5,
    marginRight: 8,
  },
  titleWrap: {
    flexDirection: "column",
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "SFArabic-Regular",
  },
  favText: {
    color: "#bdbdbd",
    fontSize: 12,
    marginTop: 2,
  },
});
