import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  I18nManager,
} from "react-native";
import TdLib from "react-native-tdlib";
import { Buffer } from "buffer";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";

const { width } = Dimensions.get("window");

export default function ChannelHeader({ chatId, chatInfo, superGroupeInfo }: { chatId: number, chatInfo: any, superGroupeInfo: any }) {
  const [title, setTitle] = useState("");
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState("");
  const [minithumbnailUri, setMinithumbnailUri] = useState("");
  const [fileId, setFileId] = useState<number | null>(null);

  const navigation:any = useNavigation();

  console.log(superGroupeInfo)
  useEffect(() => {
    if (chatInfo) {
        setTitle(chatInfo?.title);
        setMemberCount(superGroupeInfo?.memberCount || null);

        if (chatInfo?.photo?.minithumbnail?.data) {
          const buffer = Buffer.from(chatInfo.photo.minithumbnail.data);
          const base64 = buffer.toString("base64");
          setMinithumbnailUri(`data:image/jpeg;base64,${base64}`);
        }

        const photo = chatInfo.photo?.small;
        if (photo?.id) {
          setFileId(photo.id);
        } else if (photo?.local?.isDownloadingCompleted && photo?.local?.path) {
          setPhotoUri(`file://${photo.local.path}`);
        }

    }
  }, [chatInfo, superGroupeInfo]);

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

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        //onPress={() => navigation.navigate("ChannelDetail", { chatId })}
        style={styles.infoContainer}
      >
        {/* 📍 آواتار کانال */}
        <Image source={{ uri: photoUri || minithumbnailUri }} style={styles.avatar} />

        {/* 📝 عنوان و اعضا */}
        <View style={styles.textContainer}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {memberCount !== null && (
            <Text style={styles.members}>
              {memberCount} عضو
            </Text>
          )}
        </View>
      </TouchableOpacity>


      {/* 🔙 آیکون برگشت سمت چپ */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <ArrowLeft color="#ddd" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#111",
    width: "100%",
    justifyContent: "space-between",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#333",
  },
  textContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "SFArabic-Heavy",
  },
  members: {
    fontSize: 13,
    color: "#aaa",
    marginTop: 2,
    fontFamily: "SFArabic-Regular",
  },
  backButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backIcon: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    transform: [{ rotate: I18nManager.isRTL ? "0deg" : "180deg" }],
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

});
