import { useState, useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';

const { TelegramModule } = NativeModules;
const tdEmitter = new NativeEventEmitter(TelegramModule);

type DownloadStatus = 'idle' | 'downloading' | 'completed' | 'cancelled' | 'error';

export default function useMediaDownload(fileId: number) {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    listenerRef.current = tdEmitter.addListener('file', (event) => {
      if (event?.file?.id !== fileId) return;

      const local = event.file.local;

      if (local.is_downloading_completed) {
        setStatus('completed');
        setProgress(100);
      } else if (local.is_downloading_active) {
        setStatus('downloading');
        setProgress(Math.floor((local.downloaded_size / event.file.size) * 100));
      } else {
        setStatus('idle');
        setProgress(0);
      }
    });

    return () => {
      listenerRef.current?.remove();
    };
  }, [fileId]);

  const startDownload = async () => {
    try {
      setStatus('downloading');
      await TelegramModule.downloadFile(fileId); // بدون Promise چون status رو با Event دنبال می‌کنیم
    } catch (err) {
      setStatus('error');
    }
  };

  const cancelDownload = async () => {
    try {
      await TelegramModule.cancelDownload(fileId);
      setStatus('cancelled');
    } catch (err) {
      setStatus('error');
    }
  };

  return {
    status,
    progress,
    startDownload,
    cancelDownload,
  };
}
