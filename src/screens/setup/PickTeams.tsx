import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, BackHandler, ToastAndroid
} from 'react-native';

export const teamImages: { [key: string]: any } = {
  'پرسپولیس': require('../../assets/teams/perspolis.png'),
  'استقلال': require('../../assets/teams/ss.png'),
  'سپاهان': require('../../assets/teams/sepahan.png'),
  'تراکتور': require('../../assets/teams/Tractor.png'),

  'بارسلونا': require('../../assets/teams/barcelona.webp'),
  'رئال مادرید': require('../../assets/teams/realmadrid.png'),

  'آرسنال': require('../../assets/teams/arsenal.webp'),
  'منچستر یونایتد': require('../../assets/teams/man.webp'),
  'لیورپول': require('../../assets/teams/liverpool.webp'),
  'چلسی': require('../../assets/teams/Chelsea.png'),

  'بایرن': require('../../assets/teams/munich.png'),
  'اینتر': require('../../assets/teams/inter.png'),
  'میلان': require('../../assets/teams/milan.png'),
};


const teamsData = [
  { name: 'پرسپولیس', league: 'Iran', image: require('../../assets/teams/perspolis.png') },
  { name: 'استقلال', league: 'Iran', image: require('../../assets/teams/ss.png') },
  { name: 'سپاهان', league: 'Iran', image: require('../../assets/teams/sepahan.png') },
  { name: 'تراکتور', league: 'Iran', image: require('../../assets/teams/Tractor.png') },

  { name: 'بارسلونا', league: 'LaLiga', image: require('../../assets/teams/barcelona.webp') },
  { name: 'رئال مادرید', league: 'LaLiga', image: require('../../assets/teams/realmadrid.png') },

  { name: 'آرسنال', league: 'England', image: require('../../assets/teams/arsenal.webp') },
  { name: 'منچستر یونایتد', league: 'England', image: require('../../assets/teams/man.webp') },
  { name: 'لیورپول', league: 'England', image: require('../../assets/teams/liverpool.webp') },
  { name: 'چلسی', league: 'England', image: require('../../assets/teams/Chelsea.png') },

  { name: 'بایرن', league: 'Bundesliga', image: require('../../assets/teams/munich.png') },

  { name: 'اینتر', league: 'Italy', image: require('../../assets/teams/inter.png') },
  { name: 'میلان', league: 'Italy', image: require('../../assets/teams/milan.png') },
];

export default function PickTeamsScreen({ navigation }: any) {
  const backPressCount = useRef(0);
  const [favorites, setFavorites] = useState<typeof teamsData>([]);

  useEffect(() => {
    const backAction = () => {
      if (backPressCount.current === 0) {
        backPressCount.current = 1;
        ToastAndroid.show('برای خروج دوباره کلیک کنید', ToastAndroid.SHORT);
        setTimeout(() => { backPressCount.current = 0; }, 2000);
        return true;
      } else {
        BackHandler.exitApp();
        return true;
      }
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const isLeaguePicked = (league: string) =>
    favorites.some((team) => team.league === league);

  const selectTeam = (team: typeof teamsData[number]) => {
    if (favorites.length >= 3) return;
    if (isLeaguePicked(team.league)) return;

    setFavorites([...favorites, team]);
  };

  const removeTeam = (name: string) => {
    setFavorites(favorites.filter((team) => team.name !== name));
  };

  const handleStart = async() => {
    if (favorites.length === 0) {
      ToastAndroid.show("حداقل یک تیم انتخاب کن!", ToastAndroid.SHORT);
      return;
    }

    if (favorites.length === 1) {
      await AsyncStorage.setItem("auth-status", JSON.stringify("home"))
      await AsyncStorage.setItem("teams", JSON.stringify({team1: favorites[0].name}))
      navigation.navigate('Tabs');
    } else {
      navigation.navigate('Priority', { favorites });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>طرفدار کدام تیم ها هستید؟ (مهم)</Text>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.name}
        horizontal
        contentContainerStyle={styles.favoritesContainer}
        renderItem={({ item }) => (
          <View style={styles.favoriteItem}>
            <Image source={item.image} style={styles.favoriteLogo} resizeMode='contain'/>
            <Text style={styles.favoriteText}>{item.name}</Text>
            <TouchableOpacity onPress={() => removeTeam(item.name)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <FlatList
        data={teamsData}
        keyExtractor={(item) => item.name}
        numColumns={3}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const selected = favorites.some((t) => t.name === item.name);
          const leaguePicked = isLeaguePicked(item.league);
          const disabled = (leaguePicked && !selected) || favorites.length >= 3;

          return (
            <TouchableOpacity
              disabled={disabled}
              onPress={() => selectTeam(item)}
              style={[
                styles.teamCard,
                selected && styles.selected,
                disabled && styles.disabled
              ]}
            >
              <View style={styles.blurOverlay} />
              <Image source={item.image} style={styles.teamLogo} resizeMode='contain' />
              <Text style={styles.teamName}>{item.name}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.Button} onPress={handleStart}>
        <Text style={styles.ButtonText}>تمام</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 15 },
  title: { color: '#fff', fontSize: 17, marginTop: 5, textAlign: 'center', fontFamily: "SFArabic-Regular" },

  favoritesContainer: { paddingVertical: 10 },
  favoriteItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  favoriteLogo: { width: 20, height: 20 },
  favoriteText: { color: '#ddd', fontSize: 14, fontFamily: "SFArabic-Regular" },
  removeBtn: { marginLeft: 8 },
  removeBtnText: { color: '#fff', fontSize: 18 },

  teamCard: {
    width: '30%', // مقدار ثابت برای 3 تا آیتم در هر ردیف
    height: 95,
    margin: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#0c0c0cff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  teamLogo: { width: 39, height: 39, marginBottom: 8},
  teamName: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: "SFArabic-Regular",
  },
  selected: {
    borderColor: '#555',
    borderWidth: 1.4,
  },
  disabled: {
    opacity: 0.3,
  },
  Button: {
    marginTop: 25,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ButtonText: {
    color: '#000',
    fontSize: 16.5,
    fontFamily: "SFArabic-Regular",
  },
});
