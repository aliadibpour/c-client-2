import TdLib, { TdLibParameters } from 'react-native-tdlib';

type Result<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export class TelegramService {
  private static isStarted = false;
  private static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static parameters = {
    api_id: 33104773,
    api_hash: "67d4090c8e5fe84d5b600751d6df55fc"
  } as TdLibParameters;

  static async start(): Promise<Result<void>> {
    if (this.isStarted) return { success: true };

    try {
      const start = await TdLib.startTdLib(this.parameters);
      this.isStarted = true;

      return { success: true };
    } catch (err) {
      console.error('❌ TDLib Init or AuthState Error:', err);
      return { success: false, error: translateError(err) };
    }
  }


  static async login(countrycode: string, phoneNumber: string): Promise<Result<void>> {
    try {
      await TdLib.login({ countrycode, phoneNumber });
      return { success: true };
    } catch (e) {
      console.error("Login error:", e);
      return { success: false, error: translateError(e) };
    }
  }

  static async verifyCode(code: string): Promise<Result<any>> {
    try {
      const verifyCode = await TdLib.verifyPhoneNumber(code);
      return { success: true, data: verifyCode };
    } catch (e) {
      console.error("Code verification failed:", e);
      return { success: false, error: translateError(e) };
    }
  }

  static async verifyPassword(password: string): Promise<Result<void>> {
    try {
      await TdLib.verifyPassword(password);
      return { success: true };
    } catch (e) {
      console.error("Password verification failed:", e);
      return { success: false, error: 'Password incorrect' };
    }
  }

  static async getProfile(): Promise<Result<any>> {
    try {
      const profile = await TdLib.getProfile();
      return { success: true, data: profile };
    } catch (e) {
      return { success: false, error: 'Failed to get profile' };
    }
  }

  static async logout(): Promise<Result<void>> {
    try {
      await TdLib.logout();
      this.isStarted = false;
      console.log("Logged out.");
      return { success: true };
    } catch (e) {
      console.error("Logout failed:", e);
      return { success: false, error: 'Logout failed' };
    }
  }

  static async getAuthState(): Promise<Result<any>> {
    try {
      const state = await TdLib.getAuthorizationState();
      return { success: true, data: state };
    } catch (e) {
      console.error("Failed to get authorization state:", e);
      return { success: false, error: 'Auth state unavailable' };
    }
  }

  static async getUpdate(): Promise<Result<any>> {
    try {
      const request = {
        '@type': 'updateAuthorizationState',
        only_locales: true,
      };
      const a = await TdLib.td_json_client_send(request);
      console.log(a);
      return { success: true, data: a };
    } catch (e) {
      return { success: false, error: 'Update request failed' };
    }
  }

  static async close(): Promise<Result<void>> {
    try {
      await TdLib.td_json_client_send({ "@type": "close" });
      console.log('📴 TDLib closed');
      this.isStarted = false;
      return { success: true };
    } catch (err) {
      console.error('❌ Error closing TDLib:', err);
      return { success: false, error: translateError(err) };
    }
  }

  static async restart(): Promise<Result<void>> {
    console.log('🔄 Restarting TDLib...');
    await this.close();
    await this.delay(300);
    return await this.start();
  }


  static async getLastMessagesFromChannel(username = 'toofan_sorkh64') {
    try {
      // Step 1: Send request to find chat
      await TdLib.td_json_client_send({
        "@type": "searchPublicChat",
        "username": username
      });

      let chat = null;
      const start = Date.now();
      while (Date.now() - start < 5000) {
        const update = await TdLib.td_json_client_receive();
        if (!update) continue;

        const data = typeof update === 'string' ? JSON.parse(update) : update;

        // Wait for chat info
        if (data["@type"] === "chat") {
          chat = data;
          break;
        }
      }

      if (!chat) throw new Error("⏰ Timeout waiting for result: chat");

      const chatId = chat.id;

      // Step 2: Send request to get chat history
      await TdLib.td_json_client_send({
        "@type": "getChatHistory",
        "chat_id": chatId,
        "from_message_id": 0,
        "offset": 0,
        "limit": 10,
        "only_local": false
      });

      let messages = null;
      const start2 = Date.now();
      while (Date.now() - start2 < 5000) {
        const update = await TdLib.td_json_client_receive();
        if (!update) continue;

        const data = typeof update === 'string' ? JSON.parse(update) : update;

        // Look for messages array
        if (data["@type"] === "messages") {
          messages = data.messages;
          break;
        }
      }

      if (!messages) throw new Error("⏰ Timeout waiting for result: messages");

      console.log("📥 پیام‌ها:", messages);
      return messages;
    } catch (error) {
      console.error("❌ خطا در دریافت پیام‌ها:", error);
      return null;
    }
  }
}

export async function getChatHistory(
  chatId: number,
  fromMessageId: number = 0,
  PAGE_SIZE: number = 20,
  offset: number = 0
): Promise<any[]> {
  try {
    const result: any[] = await TdLib.getChatHistory(chatId, fromMessageId, PAGE_SIZE, offset);
    const parsed: any[] = result.map((item) => JSON.parse(item.raw_json));

    return parsed
  } catch (err) {
    console.error("❌ getChatFromLast error:", err);
    return []
  }
}

export async function getChat(chatId: number) {
  try {
    const result: any = await TdLib.getChat(chatId);
    const chat = JSON.parse(result.raw);

    return chat;
  } catch (error) {
    console.error("error on getChat:",error)
  }
}

function translateError(error: any): string {
  const message = typeof error === 'string' ? error : error?.message || '';

  if (message.includes('PHONE_NUMBER_INVALID')) return 'شماره تلفن وارد شده نامعتبر است.';
  if (message.includes('PHONE_CODE_INVALID')) return 'کد وارد شده اشتباه است.';
  if (message.includes('PHONE_CODE_EXPIRED')) return 'کد منقضی شده است.';
  if (message.includes('UNEXPECTED_PHONE_CODE')) return 'کدی که وارد کرده‌اید معتبر نیست.';
  if (message.includes('PASSWORD_HASH_INVALID')) return 'رمز عبور اشتباه است.';
  if (message.includes('SESSION_PASSWORD_NEEDED')) return 'نیاز به رمز دوم دارید.';
  if (message.includes('FLOOD_WAIT')) return 'لطفاً چند دقیقه بعد دوباره تلاش کنید.';
  if (message.includes('NETWORK') || message.includes('CONNECTION')) return 'مشکل در اتصال به اینترنت.';
  if (message.includes('PHONE_NUMBER_OCCUPIED')) return 'این شماره قبلاً ثبت‌نام کرده است.';
  if (message.includes('PHONE_NUMBER_FLOOD')) return 'تلاش‌های زیادی برای این شماره انجام شده است. لطفاً بعداً تلاش کنید.';

  return 'خطای ناشناخته‌ای رخ داده است.';
}
