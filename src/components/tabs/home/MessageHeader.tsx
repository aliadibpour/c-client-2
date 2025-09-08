// components/tabs/home/MessageHeader.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";

export default function MessageHeader({ chat, chatId }: any) {
  const [title, setTitle] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [minithumbnailUri, setMinithumbnailUri] = useState("");
  const [fileId, setFileId] = useState<any>(null);
  const navigation: any = useNavigation();

  // apply server-provided chat object OR fetch via TdLib.getChat if not provided
  useEffect(() => {
    let isMounted = true;

    const applyChatObject = (c: any) => {
      if (!c || !isMounted) return;

      // Title
      setTitle(c.title ?? c.raw?.title ?? "");

      // minithumbnail handling: server may give base64 string or a data field
      const miniFromServer = c.minithumbnail ?? c.raw?.minithumbnail?.data ?? c.raw?.minithumbnail ?? null;
      if (miniFromServer) {
        // if it's already a data URI
        if (typeof miniFromServer === "string" && miniFromServer.startsWith("data:")) {
          setMinithumbnailUri(miniFromServer);
        } else if (typeof miniFromServer === "string") {
          // assume base64 (or raw "/9j/..." base64-like string)
          setMinithumbnailUri(`data:image/jpeg;base64,${miniFromServer}`);
        } else if (miniFromServer instanceof Uint8Array || Array.isArray(miniFromServer)) {
          // convert bytes to base64
          try {
            const buf = Buffer.from(miniFromServer as any);
            setMinithumbnailUri(`data:image/jpeg;base64,${buf.toString("base64")}`);
          } catch (e) {
            // ignore
          }
        }
      }

      // photo.small handling: prefer local path if already downloaded, else pick id for download
      const small = c.photo?.small ?? c.raw?.photo?.small ?? null;
      if (small) {
        if (small.local?.path) {
          setPhotoUri(`file://${small.local.path}`);
        } else if (small.id) {
          setFileId(small.id);
        } else if (small.remote?.id) {
          // some server/raw shapes put remote.id
          setFileId(small.remote.id);
        }
      }
    };

    if (chat) {
      applyChatObject(chat);
      return () => { isMounted = false; };
    }

    // fallback: TdLib.getChat
    (async () => {
      if (!chatId) return;
      try {
        const result: any = await TdLib.getChat(Number(chatId));
        const chatObj = JSON.parse(result.raw);
        applyChatObject({
          title: chatObj.title,
          raw: chatObj,
          minithumbnail: chatObj.minithumbnail?.data ?? null,
          photo: chatObj.photo ? { small: chatObj.photo.small, big: chatObj.photo.big } : null,
        });
      } catch (err) {
        console.error("Error loading chat info:", err);
      }
    })();

    return () => { isMounted = false; };
  }, [chat, chatId]);

  // second effect: when we have fileId -> download via TdLib.downloadFile(fileId)
  useEffect(() => {
    let isMounted = true;
    if (!fileId) return;

    const download = async () => {
      try {
        // Use your wrapper exactly like you posted: call TdLib.downloadFile(fileId) and parse result.raw
        const result: any = await TdLib.downloadFile(fileId);
        const file = JSON.parse(result.raw);
        if (file.local?.isDownloadingCompleted && file.local?.path && isMounted) {
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
    if (chatId) navigation.navigate("Channel", { chatId });
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
    >
      <Image
        source={{ uri: photoUri || minithumbnailUri || undefined }}
        style={{ width: 35, height: 35, borderRadius: 25, backgroundColor: "#eee" }}
      />
      <Text
        style={{
          fontSize: 16,
          marginLeft: 7,
          fontFamily: "SFArabic-Heavy",
          color: "white",
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
