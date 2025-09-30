import TdLib from "react-native-tdlib";

const activeDownloads: Record<string, boolean> = {};

export const startDownload = async (
  fileId: number,
  onComplete: (path: string) => void
) => {
  if (activeDownloads[fileId]) return;

  try {
    // 1. چک کن فایل قبلاً دانلود شده یا نه
    const fileInfo: any = await TdLib.getFile(fileId);
    const file = JSON.parse(fileInfo.raw);

    if (file.local?.isDownloadingCompleted && file.local.path) {
      onComplete(`file://${file.local.path}`);
      return;
    }

    // 2. اگر دانلود نشده بود → شروع دانلود
    activeDownloads[fileId] = true;
    const result: any = await TdLib.downloadFile(fileId);
    const downloaded = JSON.parse(result.raw);

    if (downloaded.local?.isDownloadingCompleted && downloaded.local.path) {
      onComplete(`file://${downloaded.local.path}`);
    }
  } catch (error) {
    console.error("Download error:", error);
  } finally {
    delete activeDownloads[fileId];
  }
};


export const cancelDownload = async (fileId: number) => {
  try {
    await TdLib.cancelDownloadFile(fileId, false);
    delete activeDownloads[fileId];
  } catch (error) {
    console.error("Cancel error:", error);
  }
};
