// MessageHeader.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";

/**
 * Improvements:
 * - module-level in-memory cache (chatMetaCache) to avoid repeated TdLib.getChat/downloadFile
 * - fast path when chatInfo prop is provided
 * - React.memo to avoid re-renders when chatId/chatInfo unchanged
 * - isMounted ref to avoid setState after unmount
 */

// Module-level cache shared across component instances
type ChatMeta = {
  title?: string;
  photoUri?: string; // file:// path or data:...
  minithumbnailUri?: string;
  fileId?: number;
};
const chatMetaCache = new Map<number, ChatMeta>();

function shallowEqualChatInfo(a: any, b: any) {
  // cheap check: same reference or same title + fileId
  if (a === b) return true;
  if (!a || !b) return false;
  return a.title === b.title && a.fileId === b.fileId && a.photoUri === b.photoUri && a.minithumbnailUri === b.minithumbnailUri;
}

function MessageHeaderInner({ chatId, chatInfo }: any) {
  const [title, setTitle] = useState<string>(chatInfo?.title || "");
  const [photoUri, setPhotoUri] = useState<string>(chatInfo?.photoUri || "");
  const [minithumbnailUri, setMinithumbnailUri] = useState<string>(chatInfo?.minithumbnailUri || "");
  const [fileId, setFileId] = useState<number | null>(chatInfo?.fileId ?? null);
  const navigation: any = useNavigation();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // If parent provided chatInfo, prefer that (fast path)
  useEffect(() => {
    if (chatInfo) {
      if (chatInfo.title) setTitle(chatInfo.title);
      if (chatInfo.photoUri) setPhotoUri(chatInfo.photoUri);
      else if (chatInfo.minithumbnailUri) setMinithumbnailUri(chatInfo.minithumbnailUri);
      if (chatInfo.fileId) setFileId(chatInfo.fileId);
      return;
    }

    // fallback: try module-level cache first
    let numericChatId = typeof chatId === "number" ? chatId : Number(chatId);
    if (!numericChatId || isNaN(numericChatId)) return;

    const cached = chatMetaCache.get(numericChatId);
    if (cached) {
      if (cached.title) setTitle(cached.title);
      if (cached.photoUri) setPhotoUri(cached.photoUri);
      else if (cached.minithumbnailUri) setMinithumbnailUri(cached.minithumbnailUri || "");
      if (cached.fileId) setFileId(cached.fileId);
      return;
    }

    // If not cached, call TdLib.getChat once and cache result
    (async () => {
      try {
        const res: any = await TdLib.getChat(numericChatId);
        const chat = typeof res.raw === "string" ? JSON.parse(res.raw) : res;
        if (!isMounted.current) return;

        const meta: ChatMeta = {};
        if (chat.title) {
          meta.title = chat.title;
          setTitle(chat.title);
        }
        if (chat.photo?.minithumbnail?.data) {
          try {
            const buffer = Buffer.from(chat.photo.minithumbnail.data);
            const base64 = buffer.toString("base64");
            meta.minithumbnailUri = `data:image/jpeg;base64,${base64}`;
            setMinithumbnailUri(meta.minithumbnailUri);
          } catch (e) {
            // ignore
          }
        }
        const photo = chat.photo?.small;
        if (photo?.local?.isDownloadingCompleted && photo?.local?.path) {
          meta.photoUri = `file://${photo.local.path}`;
          setPhotoUri(meta.photoUri);
        } else if (photo?.id) {
          meta.fileId = photo.id;
          setFileId(photo);
        }
        // store in module-level cache for future instances
        chatMetaCache.set(numericChatId, meta);
      } catch (err) {
        console.error("MessageHeader.getChat error:", err);
      }
    })();
  }, [chatId, chatInfo]);

  // If we have a fileId and no photoUri, download only once and cache result
  useEffect(() => {
    if (!fileId) return;
    // check cache again to avoid duplicate downloads across mounts
    const numericChatId = Number(chatId);
    const cached = chatMetaCache.get(numericChatId);
    if (cached && cached.photoUri) {
      setPhotoUri(cached.photoUri);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res: any = await TdLib.downloadFileByRemoteId("fileId");
        const file = typeof res.raw === "string" ? JSON.parse(res.raw) : res;
        if (cancelled || !isMounted.current) return;
        if (file.local?.isDownloadingCompleted && file.local.path) {
          const uri = `file://${file.local.path}`;
          setPhotoUri(uri);
          // update module cache
          const exist = chatMetaCache.get(Number(chatId)) || {};
          exist.photoUri = uri;
          chatMetaCache.set(Number(chatId), exist);
        }
      } catch (err) {
        console.log("MessageHeader.downloadFile error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, chatId]);

  const handlePress = useCallback(() => {
    navigation.navigate("Channel", { chatId });
  }, [navigation, chatId]);

  return (
    <TouchableOpacity onPress={handlePress} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
      <Image source={{ uri: photoUri || minithumbnailUri || undefined }} style={styles.avatar} />
      <Text numberOfLines={1} style={styles.title}>
        {title || "کانال"}
      </Text>
    </TouchableOpacity>
  );
}

// wrap in React.memo with simple comparator to prevent unnecessary re-renders
export default React.memo(MessageHeaderInner, (prevProps, nextProps) => {
  // if chatId or chatInfo reference changed -> re-render, otherwise skip
  if (prevProps.chatId !== nextProps.chatId) return false;
  const a = prevProps.chatInfo;
  const b = nextProps.chatInfo;
  // if both missing, ok (use cache), if shallow equal, skip
  return shallowEqualChatInfo(a, b);
});

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
    color: "#edededff",
  },
});
