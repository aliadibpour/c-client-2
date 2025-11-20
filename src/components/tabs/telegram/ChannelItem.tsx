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

// caches / inflight
const downloadCache = new Map<string, string | null>();
const inflightFetch = new Map<string, Promise<string | null>>();
const DEBUG = true;

// make URL: supports fetching by chatId or remoteId
function makeProfileUrl({ chatId, remoteId }: { chatId?: any; remoteId?: any }) {
  // if (remoteId) return `https://cornerlive:9000/feed-channel?remoteId=${encodeURIComponent(String(remoteId))}`;
  // if (chatId) return `https://cornerlive:9000/feed-channel?chatId=${encodeURIComponent(String(chatId))}`;
  return `https://cornerlive:9000/feed-channel`;
}
function makeServerKey(chatId?: any, remoteId?: any) {
  if (remoteId) return `r:${String(remoteId)}`;
  if (chatId) return `s:${String(chatId)}`;
  return `s:unknown`;
}

export default function ChannelItem({
  channel,
  onReady,
}: {
  channel: ChannelProp;
  onReady?: (id: string | number | null | undefined) => void;
}) {
  const navigation: any = useNavigation();
  const [title, setTitle] = useState<string>("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null); // final avatar
  const [miniAvatarUri, setMiniAvatarUri] = useState<string | null>(null); // small immediate avatar
  const [lastMessagePreview, setLastMessagePreview] = useState<string>("");
  const [lastMsgThumbUri, setLastMsgThumbUri] = useState<string | null>(null);
  const [resolvedChatId, setResolvedChatId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const mountedRef = useRef(true);
  const calledReadyRef = useRef(false);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const setMiniFromBase64 = (b64: string | null | undefined, setter: (s: string | null) => void) => {
    if (!b64) { setter(null); return; }
    if (b64.startsWith("data:")) { setter(b64); return; }
    const trimmed = b64.trim();
    if (trimmed.length > 0) setter(`data:image/jpeg;base64,${trimmed}`);
    else setter(null);
  };

  // normalize keys from the shape you pasted
  const normalize = (ch: any) => ({
    title: ch?.title ?? ch?.name ?? ch?.username ?? null,
    chatId: ch?.chatId ?? ch?.id ?? null,
    username: ch?.username ?? null,
    avatarRemoteId: ch?.avatarRemoteId ?? ch?.avatar_remote_id ?? null,
    avatarSmallBase64: ch?.avatarSmallBase64 ?? ch?.avatar_small_base64 ?? null,
    miniThumbnailBase64: ch?.miniThumbnailBase64 ?? ch?.miniThumbnail ?? ch?.miniThumbnailBase64 ?? ch?.miniThumbnailBase64 ?? null,
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
    setLastMsgThumbUri(null);
    if (typeof thumb === "string" && thumb.length > 0) {
      setMiniFromBase64(thumb, setLastMsgThumbUri);
    }
  };

  // fetch helper (tries cache, inflight reuse)
  async function fetchProfileFromServer(chatId?: any, remoteId?: any): Promise<string | null> {
    const key = makeServerKey(chatId, remoteId);
    if (DEBUG) console.log("[fetchProfileFromServer] key:", key, { chatId, remoteId });

    if (downloadCache.has(key)) {
      if (DEBUG) console.log("[fetchProfileFromServer] cache hit", key);
      return downloadCache.get(key) ?? null;
    }
    if (inflightFetch.has(key)) {
      if (DEBUG) console.log("[fetchProfileFromServer] join inflight", key);
      return inflightFetch.get(key)!;
    }

    const promise = (async () => {
      try {
        const url = makeProfileUrl({ chatId, remoteId });
        if (DEBUG) console.log("[fetchProfileFromServer] fetching:", url);
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) { downloadCache.set(key, null); return null; }
        const text = await res.text();
        if (!text) { downloadCache.set(key, null); return null; }
        const trimmed = text.trim();
        if (trimmed.length === 0) { downloadCache.set(key, null); return null; }
        // server might return a data: uri already; handle both
        const dataUri = trimmed.startsWith("data:") ? trimmed : `data:image/jpeg;base64,${trimmed}`;
        downloadCache.set(key, dataUri);
        if (DEBUG) console.log("[fetchProfileFromServer] saved to cache", key);
        return dataUri;
      } catch (e: any) {
        if (DEBUG) console.warn("[fetchProfileFromServer] error", e?.message ?? e);
        downloadCache.set(key, null);
        return null;
      } finally {
        inflightFetch.delete(key);
      }
    })();
    inflightFetch.set(key, promise);
    return promise;
  }

  // apply incoming channel object (supports the exact keys you provided)
  const applyChannel = (ch: any) => {
    if (!ch) return;
    const n = normalize(ch);
    if (n.title) setTitle(n.title);
    if (n.chatId !== null && n.chatId !== undefined) setResolvedChatId(n.chatId);

    // last message preview & thumb
    extractPreviewAndThumb({ lastMessageText: n.lastMessageText, lastMessageMiniThumbnail: n.lastMessageMiniThumbnail });

    // 1) if full profile base64 provided, use it as final avatar
    if (n.profileBase64) {
      setMiniFromBase64(n.profileBase64, (val) => { setAvatarUri(val); setMiniAvatarUri(null); });
      setLoading(false);
      return;
    }

    // 2) If small base64 present, show immediately as mini
    if (n.avatarSmallBase64) {
      setMiniFromBase64(n.avatarSmallBase64, setMiniAvatarUri);
      // don't return — we still may try server fetch to replace with better image
      setLoading(false);
    } else if (n.miniThumbnailBase64) {
      setMiniFromBase64(n.miniThumbnailBase64, setMiniAvatarUri);
      setLoading(false);
    }

    // 3) attempt server fetch using remoteId first, then chatId
    const tryFetch = async () => {
      const remoteId = n.avatarRemoteId ?? null;
      const cid = n.chatId ?? null;
      // prefer remoteId if available
      if (remoteId) {
        const data = await fetchProfileFromServer(undefined, remoteId);
        if (!mountedRef.current) return;
        if (data) { setAvatarUri(data); setMiniAvatarUri(null); setLoading(false); return; }
      }
      if (cid) {
        const data = await fetchProfileFromServer(cid, undefined);
        if (!mountedRef.current) return;
        if (data) { setAvatarUri(data); setMiniAvatarUri(null); setLoading(false); return; }
      }
      // nothing from server; we're done (keep mini if any)
      if (mountedRef.current) setLoading(false);
    };

    // kick off background fetch but don't block UI
    tryFetch();
  };

  // init
  useEffect(() => {
    setLoading(true);
    calledReadyRef.current = false;
    if (typeof channel === "object" && channel !== null) {
      if (DEBUG) console.log("[ChannelItem] channel object:", channel);
      applyChannel(channel);
    } else if (typeof channel === "string" || typeof channel === "number") {
      setTitle(String(channel));
      setResolvedChatId(channel);
      setMiniAvatarUri(null);
      setAvatarUri(null);
      setLastMessagePreview("");
      setLastMsgThumbUri(null);
      setLoading(false);
    } else {
      setTitle("بدون عنوان");
      setMiniAvatarUri(null);
      setAvatarUri(null);
      setLastMessagePreview("");
      setLastMsgThumbUri(null);
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    if (!loading && !calledReadyRef.current) {
      onReady?.(resolvedChatId ?? channel);
      calledReadyRef.current = true;
    }
  }, [loading, resolvedChatId, channel, onReady]);

  const handlePress = async() => {
    try {
      navigation.navigate("Channel", { chatId: +channel?.chatId, cache: true, username: channel?.username });
    } catch (e) { if (DEBUG) console.log("navigate error", e); }
  };

  // render: if neither image is available, bail (same behavior you had)
  if (loading) {
    // small window only — we set loading=false as soon as a mini exists or background fetch finishes
    return null;
  }
  if (!avatarUri && !miniAvatarUri) return null;

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      {(avatarUri || miniAvatarUri) ? (
        <Image source={{ uri: avatarUri || miniAvatarUri || "" }} style={styles.avatar} />
      ) : null}
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
    backgroundColor: "#0e0e0eff",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 25.5,
    marginRight: 8,
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
