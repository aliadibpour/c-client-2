// MessageHeader.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";

/**
 * MessageHeader now accepts optional prop `chatInfo`.
 * If chatInfo is provided it will render using it (fast).
 * If not provided, it falls back to the original behavior (getChat + downloadFile).
 */

export default function MessageHeader({ chatId, chatInfo }: any) {
  const [title, setTitle] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [minithumbnailUri, setMinithumbnailUri] = useState("");
  const [fileId, setFileId] = useState<number | null>(null);
  const navigation: any = useNavigation();

  useEffect(() => {
    // If chatInfo prop is passed, use it directly (fast path)
    if (chatInfo) {
      setTitle(chatInfo.title || "");
      if (chatInfo.photoUri) setPhotoUri(chatInfo.photoUri);
      else if (chatInfo.minithumbnailUri) setMinithumbnailUri(chatInfo.minithumbnailUri);
      if (chatInfo.fileId) setFileId(chatInfo.fileId);
      return;
    }

    // fallback: original behavior (keep it intact)
    let mounted = true;
    const fetchChatInfo = async () => {
      if (!chatId) return;
      try {
        const result: any = await TdLib.getChat(chatId);
        const chat = JSON.parse(result.raw);
        if (!mounted) return;
        setTitle(chat.title);

        if (chat.photo?.minithumbnail?.data) {
          try {
            const buffer = Buffer.from(chat.photo.minithumbnail.data);
            const base64 = buffer.toString("base64");
            setMinithumbnailUri(`data:image/jpeg;base64,${base64}`);
          } catch (e) {
            // ignore
          }
        }

        const photo = chat.photo?.small;
        if (photo?.id) {
          setFileId(photo.id);
        } else if (photo?.local?.isDownloadingCompleted && photo?.local?.path) {
          setPhotoUri(`file://${photo.local.path}`);
        }
      } catch (err) {
        console.error("Error loading chat info:", err);
      }
    };

    fetchChatInfo();

    return () => {
      mounted = false;
    };
  }, [chatId, chatInfo]);

  useEffect(() => {
    let isMounted = true;
    if (!fileId) return;

    const download = async () => {
      try {
        const result: any = await TdLib.downloadFile(fileId);
        const file = JSON.parse(result.raw);
        if (file.local?.isDownloadingCompleted && file.local.path && isMounted) {
          setPhotoUri(`file://${file.local.path}`);
        }
      } catch (err) {
        console.log("Download error:", err);
      }
    };

    download();

    return () => {
      isMounted = false;
    };
  }, [fileId]);

  const handlePress = () => {
    navigation.navigate("Channel", { chatId });
  };

  return (
    <TouchableOpacity onPress={handlePress} style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
      <Image source={{ uri: photoUri || minithumbnailUri }} style={styles.avatar} />
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 35,
    height: 35,
    borderRadius: 25,
    backgroundColor: "#eee",
  },
  title: {
    fontSize: 16,
    marginLeft: 7,
    fontFamily: "SFArabic-Heavy",
    color: "white",
  },
});
