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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Profile = {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePhoto?: {
    minithumbnail?: { data: number[] };
  };
  usernames: {
    activeUsernames: string[];
  };
};

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);
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

        const reversed = uris.reverse();
        setPhotos(reversed);
        setCurrentIndex(reversed.length - 1);

        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: reversed.length - 1,
            animated: false,
          });
        }, 100);
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
    setCurrentIndex(index);
  };

  const goPrevious = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: false });
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goNext = () => {
    if (currentIndex < photos.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: false });
      setCurrentIndex(currentIndex + 1);
    }
  };

  const renderFallback = () => {
    if (profile?.profilePhoto?.minithumbnail?.data) {
      const base64 = fromByteArray(profile.profilePhoto.minithumbnail.data as any);
      return (
        <View>
          <Image
            source={{ uri: `data:image/jpeg;base64,${base64}` }}
            style={styles.image}
          />
        </View>
      );
    }

    return (
      <View style={styles.placeholder}>
        <Text style={styles.initial}>
          {profile?.firstName?.[0]?.toUpperCase() || "?"}
        </Text>
      </View>
    );
  };

  const renderName = () => (
    <Text style={styles.nameText}>
      {profile?.firstName} {profile?.lastName}
    </Text>
  );

  const renderInformation = () => (
    <View style={styles.informationBox}>
      {
        profile?.phoneNumber && (
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>
              {profile.phoneNumber.startsWith("+") ? profile.phoneNumber : `${profile.phoneNumber}+`}
            </Text>
            <Text style={styles.infoLabel}>شماره تماس</Text>
          </View>
        )
      }

      {
        profile?.usernames.activeUsernames[0] && (
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>
              @{profile.usernames.activeUsernames[0]}
            </Text>
            <Text style={styles.infoLabel}>نام کاربری</Text>
          </View>
        )
      }
    </View>
  );


  const renderLineIndicator = () => {
    if (photos.length <= 1) return null;
    const width = 100 / photos.length;
    return (
      <View style={styles.indicatorContainer}>
        {[...photos].reverse().map((_, i) => {
          const realIndex = photos.length - 1 - i;
          return (
            <View
              key={i}
              style={[
                { width: `${width}%` },
                styles.indicator,
                currentIndex === realIndex && styles.indicatorActive,
              ]}
            />
          );
        })}
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

    // "ویرایش" رو به اول لیست اضافه کن
    const items = ["edit", ...teamsArray];

    return (
      <View style={styles.favoritesBox}>
        <Text style={styles.favoritesTitle}>تیم‌های مورد علاقه</Text>
        <View style={styles.favoritesList}>
          {items.map((teamName, index) => {
            if (teamName === "edit") {
              return (
                <TouchableOpacity key="edit" style={styles.teamItem} onPress={() => navigation.navigate("PickTeams")}>
                  {/* <Image source={require('../assets/edit-icon.png')} style={styles.teamLogo} /> */}
                  <Text style={styles.teamName}>ویرایش</Text>
                </TouchableOpacity>
              );
            }

            return (
              <View key={index} style={styles.teamItem}>
                <Image source={teamImages[teamName!]} style={styles.teamLogo} />
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
              <View style={{ width: SCREEN_WIDTH, height: 370 }}> {/* 👈 Item ارتفاع داره */}
                <Image source={{ uri: item }} style={styles.image} />
                <TouchableWithoutFeedback onPress={goNext}>
                  <View style={styles.touchRight}></View>
                </TouchableWithoutFeedback>
                <TouchableWithoutFeedback onPress={goPrevious}>
                  <View style={styles.touchLeft}></View>
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
              }, 100);
            }}
          />
          {renderLineIndicator()}
        </View>

      ) : (
        renderFallback()
      )}

      {/* اینجا ثابت میذاریم پایین عکس */}
      {renderName()}

      {renderInformation()}
      {renderFavoriteTeams()}
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
    backgroundColor: "#444",
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
    left: 20,
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
    flexDirection: "row-reverse",
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
    backgroundColor: "#999",
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
    paddingHorizontal:10,
    paddingVertical: 10,
    alignItems: "flex-start",
    gap:20,
    backgroundColor: "#111"
  },
  infoRow: {
  
  },
  infoValue: {
    color: "#ccc",
    fontSize: 16,
    textAlign: "right",
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
    paddingVertical:12,
    backgroundColor: "#111",
    marginTop: 15
  },
  favoritesTitle: {
    color: '#ddd',
    fontSize: 16,
    fontFamily: 'SFArabic-Regular',
    marginBottom: 10,
  },
  favoritesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10, 
  },
  teamItem: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
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
  editTeams: {
    borderRadius: 10,
  },
  editTeamsText: {
    color: "#ccc",
    fontFamily: 'SFArabic-Regular',
    fontSize: 13,
  }

});
