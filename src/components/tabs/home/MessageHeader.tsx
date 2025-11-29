// MessageHeaderWithTitleFetch.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import TdLib from "react-native-tdlib"; // ensure this is available in your project
import AppText from "../../ui/AppText";

type ChatMeta = {
  title?: string;
  photoUri?: string;
  minithumbnailUri?: string;
};

const chatMetaCache = new Map<string, ChatMeta>();

function shallowEqualChatInfo(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.title === b.title && a.photoUri === b.photoUri && a.minithumbnailUri === b.minithumbnailUri;
}

function parseTdLibChat(res: any) {
  // Some wrappers return { raw: "..." } others return parsed object
  try {
    if (!res) return null;
    if (typeof res === "string") return JSON.parse(res);
    if (res.raw && typeof res.raw === "string") return JSON.parse(res.raw);
    return res;
  } catch {
    return null;
  }
}

function MessageHeaderInner({ chatId, chatInfo }: { chatId: number | string; chatInfo?: ChatMeta }) {
  const [title, setTitle] = useState<string>(chatInfo?.title || "");
  const [photoUri, setPhotoUri] = useState<string>(chatInfo?.photoUri || "");
  const [minithumbnailUri, setMinithumbnailUri] = useState<string>(chatInfo?.minithumbnailUri || "");

  const navigation: any = useNavigation();
  const mountedRef = useRef(false);
  const latestRequestId = useRef(0);
  const key = String(chatId);

  // apply incoming chatInfo or cache on mount/prop change
  useEffect(() => {
    if (chatInfo) {
      setTitle(chatInfo.title || "");
      setPhotoUri(chatInfo.photoUri || "");
      setMinithumbnailUri(chatInfo.minithumbnailUri || "");
      chatMetaCache.set(key, chatInfo);
      return;
    }
    // no chatInfo: try cache
    const cached = chatMetaCache.get(key);
    if (cached) {
      if (cached.title) setTitle(cached.title);
      if (cached.photoUri) setPhotoUri(cached.photoUri);
      if (cached.minithumbnailUri) setMinithumbnailUri(cached.minithumbnailUri);
    }
  }, [chatId, chatInfo, key]);

  // Fetch title from TdLib only when we don't have chatInfo and no title yet
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    if (chatInfo) return; // parent provided meta — don't fetch
    if (title) return; // already have title from cache or previous fetch

    // guard races
    const thisRequest = ++latestRequestId.current;
    (async () => {
      try {
        // coerce numeric when possible
        const numeric = Number(chatId);
        const arg = Number.isNaN(numeric) ? chatId : numeric;
        const res: any = await (TdLib as any).getChat(arg);
        const chat = parseTdLibChat(res);
        if (!chat) return;
        // check still mounted & not superseded
        if (!mountedRef.current) return;
        if (thisRequest !== latestRequestId.current) return;
        if (chat.title) {
          setTitle(chat.title);
          const prev = chatMetaCache.get(key) || {};
          chatMetaCache.set(key, { ...prev, title: chat.title });
        }
      } catch (e) {
        // swallow — optional: console.warn("getChat failed", e)
        // don't retry aggressively here
      }
    })();

    // cleanup increments requestId so older responses ignored
    return () => {
      latestRequestId.current++;
    };
  }, [chatId, chatInfo, title, key]);

  // existing server avatar fetch (unchanged)
  useEffect(() => {
    if (!chatId) return;

    const url = `https://cornerlive.ir/feed-channel/profile?chatId=${encodeURIComponent(key)}`;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          // ignore non-ok
          return;
        }
        // server returns either base64 string or { avatarSmallBase64: '...' }
        let base64: string | null = null;
        try {
          const json = await res.json();
          if (!json) return;
          if (typeof json === "string") base64 = json;
          else if (json.avatarSmallBase64) base64 = json.avatarSmallBase64;
        } catch {
          const txt = await res.text();
          if (txt) base64 = txt;
        }
        if (base64) {
          const uri = `data:image/jpeg;base64,${base64}`;
          setPhotoUri(uri);
          const prev = chatMetaCache.get(key) || {};
          chatMetaCache.set(key, { ...prev, photoUri: uri });
        }
      } catch (e) {
        // ignore fetch errors
      }
    })();
  }, [chatId, key]);

  const handlePress = useCallback(() => {
    navigation.navigate("Channel", { chatId });
  }, [navigation, chatId]);

  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <Image source={{ uri: photoUri || minithumbnailUri || undefined }} style={styles.avatar} />
      <AppText numberOfLines={1} style={styles.title}>
        {title || "کانال"}
      </AppText>
    </TouchableOpacity>
  );
}

export default React.memo(MessageHeaderInner, (prevProps, nextProps) => {
  if (prevProps.chatId !== nextProps.chatId) return false;
  return shallowEqualChatInfo(prevProps.chatInfo, nextProps.chatInfo);
});

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
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
