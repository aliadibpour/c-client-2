// ChannelItem.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import AppText from "../../ui/AppText";

type ChannelProp = string | number | any;

function dataUriFromBase64(b64?: string | null) {
  if (!b64) return null;
  const trimmed = String(b64).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

export default function ChannelItem({
  channel,
  onReady,
}: {
  channel: ChannelProp;
  onReady?: (id: string | number | null | undefined) => void;
}) {
  const navigation: any = useNavigation();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [title, setTitle] = useState<string>("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [miniAvatarUri, setMiniAvatarUri] = useState<string | null>(null);
  const [lastMessagePreview, setLastMessagePreview] = useState<string>("");
  const [lastMsgThumbUri, setLastMsgThumbUri] = useState<string | null>(null);
  const [resolvedChatId, setResolvedChatId] = useState<number | string | null>(null);

  // Normalize the shape (synchronous — no networking)
  const normalize = (ch: any) => ({
    title: ch?.title ?? ch?.name ?? ch?.username ?? null,
    chatId: ch?.chatId ?? ch?.id ?? null,
    username: ch?.username ?? null,
    // server-side remote id fields are ignored (no server requests)
    avatarRemoteId: ch?.avatarRemoteId ?? ch?.avatar_remote_id ?? null,
    avatarSmallBase64: ch?.avatarSmallBase64 ?? ch?.avatar_small_base64 ?? null,
    miniThumbnailBase64: ch?.miniThumbnailBase64 ?? ch?.miniThumbnail ?? null,
    lastMessageMiniThumbnail: ch?.lastMessageMiniThumbnail ?? ch?.lastMessage_mini_thumbnail ?? null,
    lastMessageText: ch?.lastMessageText ?? ch?.lastMessage ?? null,
    profileBase64: ch?.profileBase64 ?? ch?.avatarBase64 ?? null,
  });

  const extractPreviewAndThumb = (obj: any) => {
    const msgText = obj?.lastMessageText ?? null;
    if (msgText && typeof msgText === "string") {
      const cleaned = msgText.replace(/\s+/g, " ").trim();
      const max = 60;
      setLastMessagePreview(cleaned.length > max ? cleaned.slice(0, max).trim() + "…" : cleaned);
    } else {
      setLastMessagePreview("");
    }

    const thumb = obj?.lastMessageMiniThumbnail ?? obj?.miniThumbnailBase64 ?? null;
    setLastMsgThumbUri(dataUriFromBase64(thumb));
  };

  // apply incoming channel object synchronously
  const applyChannel = (ch: any) => {
    if (!ch) return;
    const n = normalize(ch);

    if (n.title) setTitle(n.title);
    if (n.chatId !== null && n.chatId !== undefined) setResolvedChatId(n.chatId);

    extractPreviewAndThumb({ lastMessageText: n.lastMessageText, lastMessageMiniThumbnail: n.lastMessageMiniThumbnail });

    // prioritize full profileBase64, then avatarSmallBase64, then miniThumbnailBase64
    const full = dataUriFromBase64(n.profileBase64);
    const small = dataUriFromBase64(n.avatarSmallBase64);
    const mini = dataUriFromBase64(n.miniThumbnailBase64);

    if (full) {
      setAvatarUri(full);
      setMiniAvatarUri(null);
    } else {
      setAvatarUri(null);
      setMiniAvatarUri(small ?? mini);
    }
  };

  // init / respond to channel prop changes
  useEffect(() => {
    // reset fields
    setTitle("");
    setAvatarUri(null);
    setMiniAvatarUri(null);
    setLastMessagePreview("");
    setLastMsgThumbUri(null);
    setResolvedChatId(null);

    if (typeof channel === "object" && channel !== null) {
      applyChannel(channel);
    } else if (typeof channel === "string" || typeof channel === "number") {
      setTitle(String(channel));
      setResolvedChatId(channel);
    } else {
      setTitle("بدون عنوان");
    }

    // notify parent that item is "ready" (synchronous)
    // Keep behavior similar to previous: call once per update
    if (mountedRef.current) {
      onReady?.((typeof channel === "object" && channel !== null) ? (channel?.chatId ?? channel?.id ?? null) : channel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const handlePress = () => {
    try {
      navigation.navigate("Channel", { chatId: Number(resolvedChatId), cache: true, username: (channel as any)?.username });
    } catch (e) {
      // ignore navigation error
    }
  };

  if (!miniAvatarUri) return;

  // Render: show avatar (full/mini) if present, otherwise a small placeholder circle
  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      {avatarUri || miniAvatarUri ? (
        <Image source={{ uri: avatarUri || miniAvatarUri || "" }} style={styles.avatar} />
      ) : (
        <View style={styles.placeholderAvatar} />
      )}

      <View style={{ flex: 1, marginRight: 8 }}>
        <AppText numberOfLines={1} style={styles.title}>
          {title || (typeof channel === "string" ? channel : "بدون عنوان")}
        </AppText>
        <View style={styles.lastRow}>
          <AppText numberOfLines={1} style={styles.lastMessage}>
            {lastMessagePreview}
          </AppText>
          {lastMsgThumbUri ? <Image source={{ uri: lastMsgThumbUri }} style={styles.lastThumb} /> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 0.9,
    borderColor: "#222222ac",
    backgroundColor: "#0a0a0aff",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 25.5,
    marginRight: 8,
  },
  placeholderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 25.5,
    marginRight: 8,
    backgroundColor: "#222",
  },
  title: {
    fontSize: 15.5,
    fontWeight: "600",
    color: "white",
    fontFamily: "SFArabic-Heavy",
  },
  lastRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: 13,
    color: "#aaa",
    marginTop: 2,
    flex: 1,
    fontFamily: "SFArabic-Regular",
  },
  lastThumb: {
    width: 20,
    height: 18,
    borderRadius: 4,
    backgroundColor: "#333",
    marginRight: 3,
  },
});
