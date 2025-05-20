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
    api_id: 19661737,
    api_hash: "28b0dd4e86b027fd9a2905d6c343c6bb"
  } as TdLibParameters;

  static async start(): Promise<Result<void>> {
    if (this.isStarted) return { success: true };

    try {
      const start = await TdLib.startTdLib(this.parameters);
      console.log('✅ StartTdLib:', start);

      this.isStarted = true;

      const authState = await TdLib.getAuthorizationState();
      console.log('✅ InitialAuthState:', authState);

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
    await this.delay(1000);
    return await this.start();
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
