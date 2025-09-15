import { FlatList, Image, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TelegramHeader from "../../components/tabs/telegram/TelegramHeader";
import { useEffect, useState } from "react";
import ChannelItem from "../../components/tabs/telegram/ChannelItem";

export default function TelegramScreen() {
    const [channels, setChannels] = useState<any[]>([])
    useEffect(() => {
        const fetchChannels = async () => {
            const res:any = await fetch(`http://10.226.97.115:9000/feed-channel?team=esteghlal`);
            const data = await res.json();
            console.log(data)
            setChannels(data) 
        }
        fetchChannels()
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <TelegramHeader />

            <FlatList
                data={channels}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => <ChannelItem channel={item} />}
            />
        </SafeAreaView>
    )
} 


const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    header: {
        borderBottomColor: "#222",
        borderBottomWidth: 1,
        height: 60,
        backgroundColor: "#222",
    },
    logo: {
        width: 33,
        height: 33,
        borderRadius: 5,
        marginHorizontal: "auto",
        margin: "auto"
    },
})