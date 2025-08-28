import { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";

export default function MessageHeader({ chatId }: any) {
  const [title, setTitle] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [minithumbnailUri, setMinithumbnailUri] = useState("");
  const [fileId, setFileId] = useState<number | null>(null);
  const navigation:any = useNavigation();

  useEffect(() => {
    const fetchChatInfo = async () => {
      if (!chatId) return
      try {
        const result: any = await TdLib.getChat(chatId);
        const chat = JSON.parse(result.raw);
        setTitle(chat.title);

        if (chat.photo?.minithumbnail?.data) {
          const buffer = Buffer.from(chat.photo.minithumbnail.data);
          const base64 = buffer.toString("base64");
          setMinithumbnailUri(`data:image/jpeg;base64,${base64}`);
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
  }, [chatId]);

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
    <TouchableOpacity
      onPress={handlePress}
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
    >
      <Image
        source={{ uri: photoUri || minithumbnailUri }}
        style={{ width: 35, height: 35, borderRadius: 25, backgroundColor: "#eee" }}
      />
      <Text
        style={{
          fontSize: 16,
          marginLeft: 10,
          fontFamily: "SFArabic-Heavy",
          color: "white",
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
