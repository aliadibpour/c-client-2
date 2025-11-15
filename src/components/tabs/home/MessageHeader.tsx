// MessageHeaderBest.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";

/**
 * Behavior:
 *  - If chatInfo prop exists -> use it and do nothing expensive
 *  - Else:
 *     * apply module cache if available
 *     * concurrently try server (avatar) and TdLib.getChat (title + minithumbnail)
 *     * only update state from the latest request (requestId guard + AbortController for fetch)
 *  - Cache is keyed by string(chatId) so numeric or string ids are OK.
 */

type ChatMeta = {
  title?: string;
  photoUri?: string; // data:... or file://...
  minithumbnailUri?: string; // data:...
};

const chatMetaCache = new Map<string, ChatMeta>();

function shallowEqualChatInfo(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.title === b.title && a.photoUri === b.photoUri && a.minithumbnailUri === b.minithumbnailUri;
}

function normalizeBase64Input(input?: string) {
  if (!input) return null;
  const idx = input.indexOf("base64,");
  if (idx !== -1) return input.slice(idx + 7);
  return input.replace(/^"(.*)"$/, "$1");
}

export default function MessageHeaderInner({ chatId, chatInfo }: { chatId: number | string; chatInfo?: ChatMeta }) {
  const nav:any = useNavigation();
  const key = String(chatId);
  const isMounted = useRef(false);

  const [title, setTitle] = useState<string>(chatInfo?.title || "");
  const [photoUri, setPhotoUri] = useState<string>(chatInfo?.photoUri || "");
  const [minithumbnailUri, setMinithumbnailUri] = useState<string>(chatInfo?.minithumbnailUri || "");

  // request token to guard races
  const latestRequestId = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fast path: if parent provides chatInfo, apply and cache it, skip everything else.
  useEffect(() => {
    if (!chatId) return;
    if (chatInfo) {
      setTitle(chatInfo.title || "");
      setPhotoUri(chatInfo.photoUri || "");
      setMinithumbnailUri(chatInfo.minithumbnailUri || "");
      // merge into cache
      const prev = chatMetaCache.get(key) || {};
      chatMetaCache.set(key, { ...prev, ...chatInfo });
    } else {
      // If no prop, try to fill from cache immediately (so UI shows asap)
      const cached = chatMetaCache.get(key);
      if (cached) {
        if (cached.title) setTitle(cached.title);
        if (cached.photoUri) setPhotoUri(cached.photoUri);
        if (cached.minithumbnailUri) setMinithumbnailUri(cached.minithumbnailUri);
      }
    }
  }, [chatId, chatInfo, key]);

  // Heavy path: only run when chatInfo is missing or some fields are missing
  useEffect(() => {
    if (!chatId) return;
    if (chatInfo) return; // don't fetch if parent provided meta

    // Determine what we still need
    const needTitle = !title;
    const needPhoto = !photoUri;
    const needMini = !minithumbnailUri;

    // If nothing is needed, do nothing
    if (!needTitle && !needPhoto && !needMini) return;

    const thisRequestId = ++latestRequestId.current;
    let abort = false;
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;

    const fetchProfileFromServer = async (): Promise<string | null> => {
      // server returns either { avatarSmallBase64: '...' } or raw base64 string
      const url = `https://cornerlive.ir:9000/feed-channel/profile?chatId=${encodeURIComponent(key)}`;
      try {
        const res = await fetch(url, { signal: ac?.signal });
        if (!res.ok) {
          // non-ok -> ignore
          return null;
        }
        // try JSON parse
        try {
          const json = await res.json();
          if (!json) return null;
          if (typeof json === "string") return normalizeBase64Input(json);
          if (typeof json === "object" && json.avatarSmallBase64) return normalizeBase64Input(json.avatarSmallBase64);
          return null;
        } catch {
          // fallback to text
          const txt = await res.text();
          return normalizeBase64Input(txt);
        }
      } catch (e) {
        if ((e as any)?.name === "AbortError") {
          // aborted; ignore
          return null;
        }
        // network error -> ignore
        return null;
      }
    };

    const tryTdLibGetChat = async (): Promise<Partial<ChatMeta> | null> => {
      try {
        // numeric chatId may be required by TdLib - try to coerce
        const numeric = Number(chatId);
        const res: any = await TdLib.getChat(Number.isNaN(numeric) ? chatId : numeric);
        const chat = typeof res?.raw === "string" ? JSON.parse(res.raw) : res;
        if (!chat) return null;

        const meta: Partial<ChatMeta> = {};
        // title
        if (needTitle && chat.title) {
          meta.title = chat.title;
        }

        // minithumbnail (try several shapes)
        const mini = chat.photo?.minithumbnail?.data;
        if (needMini && mini) {
          try {
            let base64: string | null = null;
            if (typeof mini === "string") {
              base64 = normalizeBase64Input(mini);
            } else if (Array.isArray(mini) || ArrayBuffer.isView(mini)) {
              base64 = Buffer.from(mini as any).toString("base64");
            } else if (mini?.data && typeof mini.data === "string") {
              base64 = normalizeBase64Input(mini.data);
            }

            if (base64) {
              meta.minithumbnailUri = `data:image/jpeg;base64,${base64}`;
            }
          } catch {
            // ignore minithumbnail parse error
          }
        }

        // NOTE: we do not download full file here (heavy). server handles full avatar base64.
        return meta;
      } catch (e) {
        // TdLib failed -> ignore
        return null;
      }
    };

    (async () => {
      // run both in parallel but set states only if thisRequestId is still latest
      const serverPromise = needPhoto ? fetchProfileFromServer() : Promise.resolve<string | null>(null);
      const tdlibPromise = (needTitle || needMini) ? tryTdLibGetChat() : Promise.resolve<Partial<ChatMeta> | null>(null);

      const [serverBase64, tdMeta] = await Promise.all([serverPromise, tdlibPromise]);

      // if this is not the latest request or unmounted, ignore results
      if (abort || !isMounted.current || thisRequestId !== latestRequestId.current) {
        ac?.abort?.();
        return;
      }

      // apply server avatar if present
      if (serverBase64) {
        const uri = `data:image/jpeg;base64,${serverBase64}`;
        setPhotoUri(uri);
        // merge into cache
        const prev = chatMetaCache.get(key) || {};
        chatMetaCache.set(key, { ...prev, photoUri: uri });
      }

      // apply tdlib meta if present
      if (tdMeta) {
        if (tdMeta.title) {
          setTitle(tdMeta.title);
        }
        if (tdMeta.minithumbnailUri) {
          setMinithumbnailUri(tdMeta.minithumbnailUri);
        }
        // merge into cache
        const prev = chatMetaCache.get(key) || {};
        chatMetaCache.set(key, { ...prev, ...tdMeta });
      }
    })();

    return () => {
      abort = true;
      latestRequestId.current++;
      ac?.abort?.();
    };
  }, [chatId, chatInfo, title, photoUri, minithumbnailUri, key]);

  const handlePress = useCallback(() => {
    // navigate to channel screen
    nav.navigate("Channel" as any, { chatId });
  }, [nav, chatId]);

  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <Image source={{ uri: photoUri || minithumbnailUri || undefined }} style={styles.avatar} />
      <Text numberOfLines={1} style={styles.title}>
        {title || "کانال"}
      </Text>
    </TouchableOpacity>
  );
}

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
