import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
} from "react-native";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";

type ProfilePhotoType = {
  big: { id: number; local: { isDownloadingCompleted: boolean; path: string } };
  small: { id: number; local: { isDownloadingCompleted: boolean; path: string } };
  minithumbnail?: { data: Uint8Array };
};

type Profile = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePhoto?: ProfilePhotoType;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Load user profile
  useEffect(() => {
    (async () => {
      try {
        setLoadingProfile(true);
        const profileJson = await TdLib.getProfile();
        const profileData = JSON.parse(profileJson);
        console.log("Loaded profile:", profileData);
        setProfile(profileData);
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  // Download full profile photo
  useEffect(() => {
    let isMounted = true;
    const downloadImage = async () => {
      if (!profile?.profilePhoto?.big?.id) return;
      try {
        setLoadingPhoto(true);
        const result: any = await TdLib.downloadFile(profile.profilePhoto.big.id);
        const file = JSON.parse(result.raw);
        if (isMounted && file.local?.isDownloadingCompleted && file.local.path) {
          setPhotoPath(`file://${file.local.path}`);
        }
      } catch (err) {
        console.error("Failed to download profile photo:", err);
      } finally {
        if (isMounted) setLoadingPhoto(false);
      }
    };

    downloadImage();
    return () => {
      isMounted = false;
    };
  }, [profile?.profilePhoto?.small?.id]);

  // Base64 mini-thumbnail
  const thumbnailBase64 = useMemo(() => {
    if (!profile?.profilePhoto?.minithumbnail?.data) return null;
    return fromByteArray(profile.profilePhoto.minithumbnail.data);
  }, [profile]);

  // Render image/thumbnail/initial
  const renderProfileImage = () => {
    if (photoPath) {
      return (
        <Image
          key="full"
          source={{ uri: photoPath }}
          style={styles.profileImage}
        />
      );
    } else if (thumbnailBase64) {
      return (
        <Image
          key="thumbnail"
          source={{ uri: `data:image/jpeg;base64,${thumbnailBase64}` }}
          style={styles.profileImage}
        />
      );
    } else {
      return (
        <View style={styles.profilePlaceholder}>
          <Text style={styles.profileInitial}>
            {profile?.firstName?.[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      );
    }
  };

  return (
    <>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.container}>
        {loadingProfile ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0088cc" />
            <Text style={styles.loadingText}>در حال بارگذاری پروفایل...</Text>
          </View>
        ) : !profile ? (
          <View style={styles.centered}>
            <Text style={{ color: "white" }}>پروفایل یافت نشد.</Text>
          </View>
        ) : (
          <>
            {renderProfileImage()}
            <Text style={styles.nameText}>
              {profile.firstName} {profile.lastName}
            </Text>
            <Text style={styles.phoneText}>{profile.phoneNumber}</Text>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  profileImage: {
    width: "100%",
    height: 370,
    backgroundColor: "#111",
  },
  profilePlaceholder: {
    width: "100%",
    height: 370,
    backgroundColor: "#444",
  },
  profileInitial: {
    fontSize: 40,
    color: "white",
  },
  nameText: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 12,
  },
  phoneText: {
    color: "#bbb",
    fontSize: 16,
    marginTop: 4,
  },
  centered: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "white",
    marginTop: 12,
  },
});
