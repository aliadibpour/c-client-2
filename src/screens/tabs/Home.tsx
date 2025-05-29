import { useEffect } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TelegramService } from "../../services/TelegramService";

export default function HomeScreen() {

    useEffect(() => {
    TelegramService.getLastMessagesFromChannel()
        .then(messages => {
        if (messages) {
            console.log("🧾 آخرین پیام‌ها:", messages);
        }
        });
    }, []);



    return (
        <SafeAreaView>
            <Text style={{color: "white"}}>HomeScreen</Text>
        </SafeAreaView>
    )
} 