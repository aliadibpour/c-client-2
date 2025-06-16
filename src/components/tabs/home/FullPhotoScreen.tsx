import React from "react";
import { useRoute, useNavigation } from "@react-navigation/native";
import ImageViewer from "react-native-image-zoom-viewer";
import { Modal } from "react-native";

export default function FullPhotoScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { photoPath } = route.params as { photoPath: string };

  return (
    <Modal
      visible={true}
      transparent={true}
      onRequestClose={() => navigation.goBack()}
    >
      <ImageViewer
        imageUrls={[{ url: photoPath }]}
        onCancel={() => navigation.goBack()}
        enableSwipeDown={true}
        swipeDownThreshold={90} // حساسیت بالاتر برای بستن
        renderIndicator={() => <></>} // حذف شمارنده
        backgroundColor="#000"
        saveToLocalByLongPress={false} // غیرفعال کردن ذخیره با نگه‌داشتن طولانی
      />
    </Modal>
  );
}
