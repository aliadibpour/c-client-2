import TdLib from 'react-native-tdlib';

export class TelegramService {
  private static isStarted = false;

  static async start() {
    if (this.isStarted) return;

    try {
      const authState = await TdLib.getAuthorizationState();
      console.log("TDLib already running, state:", authState?.authorization_state);
      this.isStarted = true;
    } catch (err) {
      console.log("TDLib not started. Starting now...");
      try {
        await TdLib.startTdLib({
          api_id: 19661737,
          api_hash: "28b0dd4e86b027fd9a2905d6c343c6bb"
        });
        this.isStarted = true;
      } catch (startError) {
        console.error("Failed to start TDLib:", startError);
        throw startError;
      }
    }
  }

  /**
   * Login user
   */
  static async login(countrycode: string, phoneNumber: string) {
    try {
      await this.start(); // always ensure it's started
      await TdLib.login({ countrycode, phoneNumber });
    } catch (e) {
      console.error("Login error:", e);
      throw e;
    }
  }

  /**
   * Verify code
   */
  static async verifyCode(code: string) {
    try {
      await TdLib.verifyPhoneNumber(code);
    } catch (e) {
      console.error("Code verification failed:", e);
      throw e;
    }
  }

  /**
   * Verify 2FA password
   */
  static async verifyPassword(password: string) {
    try {
      await TdLib.verifyPassword(password);
    } catch (e) {
      console.error("Password verification failed:", e);
      throw e;
    }
  }

  /**
   * Get user profile
   */
  static async getProfile() {
    return await TdLib.getProfile();
  }

  /**
   * Logout and reset status
   */
  static async logout() {
    try {
      await TdLib.logout();
      this.isStarted = false;
      console.log("Logged out.");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  }

  /**
   * Get current authorization state
   */
  static async getAuthState() {
    try {
      return await TdLib.getAuthorizationState();
    } catch (e) {
      console.error("Failed to get authorization state:", e);
      return null;
    }
  }
}
