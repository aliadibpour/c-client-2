import TdLib from "react-native-tdlib";

const activeDownloads: Record<string, boolean> = {};

export const startMediaDownload = async (
  fileId: number,
  onComplete: (path: string) => void
) => {
  if (activeDownloads[fileId]) return;
  activeDownloads[fileId] = true;

  try {
    const result: any = await TdLib.downloadFile(fileId);
    const file = JSON.parse(result.raw);

    if (file.local?.isDownloadingCompleted && file.local.path) {
      onComplete(`file://${file.local.path}`);
    }
  } catch (error) {
    console.error("Download error:", error);
  } finally {
    delete activeDownloads[fileId];
  }
};

export const cancelMediaDownload = (fileId: number) => {
  delete activeDownloads[fileId];
};
