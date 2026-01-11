import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Image, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import TdLib from "react-native-tdlib";
import AppText from "../../ui/AppText";

type ImageQuality = "none" | "thumbnail" | "photo";

type ChatMeta = {
  title?: string;
  photoUri?: string;
  minithumbnailUri?: string;
  imageQuality?: ImageQuality;
};

const chatMetaCache = new Map<string, ChatMeta>();

function shallowEqualChatInfo(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.title === b.title &&
    a.photoUri === b.photoUri &&
    a.minithumbnailUri === b.minithumbnailUri
  );
}

function parseTdLibChat(res: any) {
  try {
    if (!res) return null;
    if (typeof res === "string") return JSON.parse(res);
    if (res.raw && typeof res.raw === "string") return JSON.parse(res.raw);
    return res;
  } catch {
    return null;
  }
}

function MessageHeaderInner({
  chatId,
  chatInfo,
}: {
  chatId: number | string;
  chatInfo?: ChatMeta;
}) {
  const navigation: any = useNavigation();
  const key = String(chatId);

  const mountedRef = useRef(false);
  const latestRequestId = useRef(0);

  const [title, setTitle] = useState("");
  const [image, setImage] = useState<{
    uri?: string;
    quality: ImageQuality;
  }>({ quality: "none" });

  /* -------------------- mount guard -------------------- */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* -------------------- apply chatInfo / cache -------------------- */
  useEffect(() => {
    const cached = chatInfo || chatMetaCache.get(key);
    if (!cached) return;

    if (cached.title) setTitle(cached.title);

    if (
      cached.photoUri &&
      (!image.uri || image.quality !== "photo")
    ) {
      setImage({ uri: cached.photoUri, quality: "photo" });
    } else if (
      cached.minithumbnailUri &&
      image.quality === "none"
    ) {
      setImage({ uri: cached.minithumbnailUri, quality: "thumbnail" });
    }
  }, [chatInfo, chatId]);

  /* -------------------- fetch title from TdLib -------------------- */
  useEffect(() => {
    if (!chatId) return;
    if (chatInfo?.title) return;
    if (title) return;

    const reqId = ++latestRequestId.current;

    (async () => {
      try {
        const numeric = Number(chatId);
        const arg = Number.isNaN(numeric) ? chatId : numeric;
        const res: any = await (TdLib as any).getChat(arg);
        const chat = parseTdLibChat(res);
        if (!chat?.title) return;

        if (!mountedRef.current) return;
        if (reqId !== latestRequestId.current) return;

        setTitle(chat.title);

        const prev = chatMetaCache.get(key) || {};
        chatMetaCache.set(key, { ...prev, title: chat.title });
      } catch {}
    })();

    return () => {
      latestRequestId.current++;
    };
  }, [chatId, chatInfo, title]);

  /* -------------------- fetch avatar from server -------------------- */
  useEffect(() => {
    if (!chatId) return;

    const url = `https://cornerlive.ir/feed-channel/profile?chatId=${encodeURIComponent(
      key
    )}`;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;

        let base64: string | null = null;

        try {
          const json = await res.json();
          if (typeof json === "string") base64 = json;
          else if (json?.avatarSmallBase64) base64 = json.avatarSmallBase64;
        } catch {
          const txt = await res.text();
          if (txt) base64 = txt;
        }

        if (!base64) return;

        if (!mountedRef.current) return;

        const uri = `data:image/jpeg;base64,${base64}`;

        // 🔒 never downgrade photo
        setImage((prev) => {
          if (prev.quality === "photo") return prev;
          return { uri, quality: "photo" };
        });

        const prev = chatMetaCache.get(key) || {};
        chatMetaCache.set(key, {
          ...prev,
          photoUri: uri,
          imageQuality: "photo",
        });
      } catch {}
    })();
  }, [chatId]);

  /* -------------------- navigation -------------------- */
  const handlePress = useCallback(() => {
    navigation.navigate("Channel", { chatId });
  }, [navigation, chatId]);

  /* -------------------- render -------------------- */
  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <Image
        source={image.uri ? { uri: image.uri } : undefined}
        style={styles.avatar}
      />
      <AppText style={styles.title}>
        {title.slice(0,37) || "کانال"}
      </AppText>
    </TouchableOpacity>
  );
}

export default React.memo(MessageHeaderInner, (prev, next) => {
  if (prev.chatId !== next.chatId) return false;
  return shallowEqualChatInfo(prev.chatInfo, next.chatInfo);
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
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
