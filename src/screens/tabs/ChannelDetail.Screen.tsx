import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
} from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";

const { width } = Dimensions.get("window");

export default function ChannelDetailScreen({ route }: any) {
  const { chatId } = route.params;

  const [chat, setChat] = useState<any>(null);
  const [photoUri, setPhotoUri] = useState("");

  useEffect(() => {
    const loadChatInfo = async () => {
      try {
        const res: any = await TdLib.getChat(chatId);
        const parsed = JSON.parse(res.raw);
        console.log(parsed)
        setChat(parsed);

        if (parsed?.photo?.small?.local?.path) {
          setPhotoUri(`file://${parsed.photo.small.local.path}`);
        } else if (parsed?.photo?.minithumbnail?.data) {
          const buffer = Buffer.from(parsed.photo.minithumbnail.data);
          const base64 = buffer.toString("base64");
          setPhotoUri(`data:image/jpeg;base64,${base64}`);
        }
      } catch (err) {
        console.log("❌ Failed to load chat info:", err);
      }
    };

    loadChatInfo();
  }, [chatId]);

  if (!chat) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#fff" }}>در حال بارگذاری...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image source={{ uri: photoUri }} style={styles.image} />
        <Text style={styles.title}>{chat.title}</Text>
        <Text style={styles.members}>
          {chat?.positions?.[0]?.total_count?.toLocaleString("fa-IR")} عضو
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>نوع:</Text>
        <Text style={styles.value}>{chat.type?.["@type"]}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>آیدی:</Text>
        <Text style={styles.value}>{chat.id}</Text>
      </View>

      {chat.description && (
        <View style={styles.section}>
          <Text style={styles.label}>توضیحات:</Text>
          <Text style={styles.value}>{chat.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  header: {
    alignItems: "center",
    marginTop: 24,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#333",
  },
  title: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "bold",
    marginTop: 12,
    fontFamily: "SFArabic-Heavy",
  },
  members: {
    color: "#aaa",
    marginTop: 4,
    fontFamily: "SFArabic-Regular",
  },
  section: {
    marginTop: 24,
  },
  label: {
    color: "#888",
    fontSize: 14,
    marginBottom: 4,
  },
  value: {
    color: "#eee",
    fontSize: 15,
  },
});
