import TdLib from 'react-native-tdlib';

export class TelegramService {
  static async start() {
    await TdLib.startTdLib({ api_id: 19661737, api_hash: "28b0dd4e86b027fd9a2905d6c343c6bb" });
  }

  static async login(countrycode: string, phoneNumber: string) {
    await TdLib.login({ countrycode, phoneNumber });
  }

  static async verifyCode(code: string) {
    await TdLib.verifyPhoneNumber(code);
  }

  static async verifyPassword(password: string) {
    await TdLib.verifyPassword(password);
  }

  static async getProfile() {
    return await TdLib.getProfile();
  }
}
