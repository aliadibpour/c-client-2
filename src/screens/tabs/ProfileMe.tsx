// ProfileScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableWithoutFeedback,
  ActivityIndicator,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
} from "react-native";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { teamImages } from "../setup/PickTeams";
import { Edit2 } from "lucide-react-native";
import { HeartIcon, LogoutIcon, PhoneIcon, UserIcon } from "../../assets/icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const flatListRef = useRef<FlatList<string>>(null);

  // Get Profile once (no loading needed)
  useEffect(() => {
    (async () => {
      try {
        const profileRaw = await TdLib.getProfile();
        const parsed = JSON.parse(profileRaw);
        console.log("📥 Profile loaded:", parsed);
        setProfile(parsed);
      } catch (e) {
        console.error("❌ Error loading profile", e);
      }
    })();
  }, []);

  // Get Profile Photos (with loading only for photos)
  useEffect(() => {
    if (!profile?.id) return;

    (async () => {
      try {
        setLoadingPhotos(true);
        const photoListRaw = await TdLib.getUserProfilePhotos(profile.id, 0, 10);
        const parsedPhotos = JSON.parse(photoListRaw);
        const uris: string[] = [];

        for (let photo of parsedPhotos.photos || []) {
          const biggest = photo.sizes[photo.sizes.length - 1];
          const result: any = await TdLib.downloadFile(biggest.photo.id);
          const file = JSON.parse(result.raw);

          if (file.local?.isDownloadingCompleted && file.local.path) {
            uris.push(`file://${file.local.path}`);
          }
        }

        // keep natural order and show first image (index 0) by default
        setPhotos(uris);
        setCurrentIndex(0);

        setTimeout(() => {
          if (uris.length > 0) {
            flatListRef.current?.scrollToIndex({
              index: 0,
              animated: false,
            });
          }
        }, 1);
      } catch (e) {
        console.error("❌ Error loading profile photos", e);
      } finally {
        setLoadingPhotos(false);
      }
    })();
  }, [profile?.id]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    const rtlIndex = photos.length - 1 - index;
    setCurrentIndex(rtlIndex);
  };

  const goPrevious = () => {
    if (currentIndex > 0) {
      const nextIndex = currentIndex - 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
    }
  };

  const goNext = () => {
    if (currentIndex < photos.length - 1) {
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
    }
  };

  const renderFallback = () => {
    if (profile?.profilePhoto?.minithumbnail?.data) {
      const base64 = fromByteArray(profile?.profilePhoto?.minithumbnail.data as any);
      return (
        <View>
          <Image
            source={{ uri: `data:image/jpeg;base64,${base64}` }}
            style={styles.image}
          />
        </View>
      );
    }

    const firstLetter = profile?.firstName?.[0]?.toUpperCase();

    // IMPORTANT: do NOT put ActivityIndicator inside <Text>
    if (firstLetter) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.initial}>{firstLetter}</Text>
        </View>
      );
    }

    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={"#999"} size="large" />
      </View>
    );
  };

  const renderInformation = () => (
    <View style={styles.informationBox}>
      {profile?.phoneNumber && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <PhoneIcon color={"#999"} />
          <View>
            <Text style={styles.infoValue}>
              {/* if phone doesn't start with +, prepend it */}
              {String(profile.phoneNumber).startsWith("+") ? profile.phoneNumber : `${profile.phoneNumber}+`}
            </Text>
            <Text style={styles.infoLabel}>شماره تماس</Text>
          </View>
        </View>
      )}

      {profile?.usernames?.activeUsernames?.[0] && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <UserIcon color={"#999"} />
          <View>
            <Text style={styles.infoValue}>@{profile.usernames.activeUsernames[0]}</Text>
            <Text style={styles.infoLabel}>نام کاربری</Text>
          </View>
        </View>
      )}
    </View>
  );

  const renderLineIndicator = () => {
    if (photos.length <= 1) return null;
    const width = 100 / photos.length;
    return (
      <View style={styles.indicatorContainer}>
        {photos.map((_, i) => (
          <View
            key={i}
            style={[
              { width: `${width}%` },
              styles.indicator,
              currentIndex === i && styles.indicatorActive,
            ]}
          />
        ))}
      </View>
    );
  };

  const [favoriteTeams, setFavoriteTeams] = useState<{team1?: string, team2?: string, team3?: string}>({});
  useEffect(() => {
    const loadFavorites = async () => {
      const teams = await AsyncStorage.getItem("teams");
      if (teams) {
        setFavoriteTeams(JSON.parse(teams));
      }
    };
    loadFavorites();
  }, []);

  const renderFavoriteTeams = () => {
    const teamsArray = [favoriteTeams.team1, favoriteTeams.team2, favoriteTeams.team3].filter(Boolean);
    const items = ["edit", ...teamsArray];

    return (
      <View style={styles.favoritesBox}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <HeartIcon color={"#999"} />
          <Text style={styles.favoritesTitle}>تیم‌های مورد علاقه</Text>
        </View>
        <View style={styles.favoritesList}>
          {items.map((teamName, index) => {
            if (teamName === "edit") {
              return (
                <TouchableOpacity key="edit" style={styles.teamItem} onPress={() => navigation.navigate("PickTeams")}>
                  <Edit2 color={"#999"} width={16} />
                  <Text style={styles.teamName}>ویرایش</Text>
                </TouchableOpacity>
              );
            }

            return (
              <View key={String(index)} style={styles.teamItem}>
                {teamImages[teamName!] ? (
                  <Image source={teamImages[teamName!]} style={styles.teamLogo} />
                ) : (
                  <View style={{ width: 24, height: 24, backgroundColor: "#444", borderRadius: 6 }} />
                )}
                <Text style={styles.teamName}>{teamName}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {loadingPhotos ? (
        <View style={styles.centered}>
          {renderFallback()}
        </View>
      ) : photos.length > 0 ? (
        <View style={{ height: 370 }}>
          <FlatList
            ref={flatListRef}
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_WIDTH, height: 370 }}>
                <Image source={{ uri: item }} style={styles.image} />
                <TouchableWithoutFeedback onPress={goNext}>
                  <View style={styles.touchRight} />
                </TouchableWithoutFeedback>
                <TouchableWithoutFeedback onPress={goPrevious}>
                  <View style={styles.touchLeft} />
                </TouchableWithoutFeedback>
              </View>
            )}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onMomentumScrollEnd={onMomentumScrollEnd}
            showsHorizontalScrollIndicator={false}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 10);
            }}
          />
          {renderLineIndicator()}
        </View>
      ) : (
        renderFallback()
      )}

      {/* اسم کاربر - راست چین شده و روی عکس قرار گرفته */}
      <Text style={styles.nameText}>
        {profile?.firstName} {profile?.lastName}
      </Text>

      {renderInformation()}
      {renderFavoriteTeams()}

      <View style={{ backgroundColor: "#111", paddingVertical: 10, paddingHorizontal: 10, marginTop: 15 }}>
        <TouchableOpacity style={{ gap: 6, alignItems: "center", flexDirection: "row" }}>
          <LogoutIcon color={"#999"} />
          <Text style={{ fontSize: 15, fontFamily: "SFArabic-Regular", color: "#ddd" }}>خروج از حساب کاربری</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  image: {
    width: SCREEN_WIDTH,
    height: 370,
    resizeMode: "cover",
    backgroundColor: "#111",
  },
  placeholder: {
    width: SCREEN_WIDTH,
    height: 370,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    fontSize: 50,
    color: "white",
  },
  nameText: {
    color: "white",
    fontSize: 25,
    position: "absolute",
    left: 20, // use right for RTL layout
    top: 325,
    fontFamily: "SFArabic-Heavy",
  },
  phoneText: {
    color: "#ccc",
    fontSize: 14,
    marginTop: 2,
    fontFamily: "SFArabic-Regular",
  },
  centered: {
    height: 370,
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    position: "absolute",
    top: 6,
    width: SCREEN_WIDTH,
    paddingHorizontal: 20,
  },
  indicator: {
    height: 2.3,
    backgroundColor: "#666",
    borderRadius: 2,
  },
  indicatorActive: {
    backgroundColor: "#fff",
  },
  touchRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: SCREEN_WIDTH / 3,
    height: "100%",
  },
  touchLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_WIDTH / 3,
    height: "100%",
  },
  informationBox: {
    paddingHorizontal: 7,
    paddingVertical: 7.5,
    alignItems: "flex-start",
    gap: 20,
    backgroundColor: "#111",
  },
  infoValue: {
    color: "#ccc",
    fontSize: 15,
    textAlign: "left",
    fontFamily: "SFArabic-Regular",
  },
  infoLabel: {
    color: "#999",
    fontSize: 12,
    textAlign: "left",
    fontFamily: "SFArabic-Light",
    marginTop: 1,
  },
  favoritesBox: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#111",
    marginTop: 15,
    gap: 8,
  },
  favoritesTitle: {
    color: '#ddd',
    fontSize: 15,
    fontFamily: 'SFArabic-Regular',
  },
  favoritesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  teamItem: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224, 222, 222, 0.12)',
    padding: 10,
    borderRadius: 10,
    width: 70,
    height: 70,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginBottom: 6,
  },
  teamName: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'SFArabic-Regular',
  },
});
