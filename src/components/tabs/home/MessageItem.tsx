import { fromByteArray } from "base64-js";
import { useEffect, useState } from "react";
import { Button, Image, Text, View } from "react-native";
import TdLib from "react-native-tdlib";

export default function MessageItem({ data }: any) {
  const minithumbnail = data.content.photo?.minithumbnail?.data || null;
  const base64 = minithumbnail ? fromByteArray(minithumbnail) : null;
  const [imagePath, setImagePath] = useState(
    base64 ? `data:image/jpeg;base64,${base64}` : null
  );
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const fileId = data.content.photo?.sizes?.[0]?.photo?.id;
      if (!fileId) {
        console.warn("No file ID available for download.");
        return;
      }

      const result:any = await TdLib.downloadFile(fileId);
      const file = JSON.parse(result.raw);

      if (file.local?.isDownloadingCompleted && file.local.path) {
        setImagePath(`file://${file.local.path}`);
        console.log("Image path set:", `file://${file.local.path}`);
      } else {
        console.warn("Download not completed or no local path.");
      }
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    console.log(data);
  }, []);

  return (
    <View style={{ borderBottomColor: "gray", borderWidth: 2, paddingVertical: 10 }}>
      {imagePath ? (
        <View>
          <Image
            source={{ uri: imagePath }}
            style={{ width: 140, height: 130, marginBottom: 10 }}
          />
          <Button title="Download Full Image" onPress={handleDownload} />
        </View>
      ) : null}
      <Text style={{ color: "white" }}>{data?.content.caption?.text}</Text>
    </View>
  );
}
