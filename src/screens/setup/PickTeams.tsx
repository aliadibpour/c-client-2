import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Image, BackHandler, ToastAndroid, Alert
} from 'react-native';

const teamsData = [
  { name: 'Persepolis', league: 'Iran', image: require('../../assets/teams/perspolis.png') },
  { name: 'Esteghlal', league: 'Iran', image: require('../../assets/teams/esteghlal.png') },
  { name: 'Sepahan', league: 'Iran', image: require('../../assets/teams/sepahan.png') },
  { name: 'Tractor', league: 'Iran', image: require('../../assets/teams/Tractor.png') },

  { name: 'Barcelona', league: 'LaLiga', image: require('../../assets/teams/barcelona.webp') },
  { name: 'Real Madrid', league: 'LaLiga', image: require('../../assets/teams/realmadrid.png') },

  { name: 'Arsenal', league: 'England', image: require('../../assets/teams/arsenal.webp') },
  { name: 'Manchester City', league: 'England', image: require('../../assets/teams/city.png') },
  { name: 'Manchester United', league: 'England', image: require('../../assets/teams/united.png') },
  { name: 'Liverpool', league: 'England', image: require('../../assets/teams/liverpool.webp') },
  { name: 'Chelsea', league: 'England', image: require('../../assets/teams/chealse.png') },

  { name: 'Bayern', league: 'Bundesliga', image: require('../../assets/teams/bayern.png') },
  { name: 'Dortmund', league: 'Bundesliga', image: require('../../assets/teams/dortmund.png') },

  { name: 'Inter', league: 'Italy', image: require('../../assets/teams/inter.png') },
  { name: 'Milan', league: 'Italy', image: require('../../assets/teams/milan.png') },
];

export default function PickTeamsScreen({ navigation }: any) {
  const backPressCount = useRef(0);
  const [favorites, setFavorites] = useState<{ name: string; league: string; image: string }[]>([]);

  useEffect(() => {
    const backAction = () => {
      if (backPressCount.current === 0) {
        ToastAndroid.show("برای خروج دوباره بازگشت را بزنید", ToastAndroid.SHORT);
        backPressCount.current = 1;
        setTimeout(() => {
          backPressCount.current = 0;
        }, 2000);
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

  const selectTeam = (team: { name: string; league: string; image: string }) => {
    if (favorites.length >= 3) return;
    if (team.name === 'Persepolis') return; // Disable Persepolis
    if (isLeaguePicked(team.league)) return;

    setFavorites([...favorites, team]);
  };

  const removeTeam = (name: string) => {
    setFavorites(favorites.filter((team) => team.name !== name));
  };

  const handleStart = () => {
    if (favorites.length === 0) {
      ToastAndroid.show("حداقل یک تیم انتخاب کن!", ToastAndroid.SHORT);
      return;
    }

    if (favorites.length === 1) {
      navigation.navigate('Home', { favorites });
    } else {
      navigation.navigate('Priority', { favorites });
    }
  };


  return (
    <View style={styles.container}>
      <Text style={styles.title}>تیم‌های مورد علاقه‌ات رو انتخاب کن</Text>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.name}
        horizontal
        contentContainerStyle={{ marginVertical: 10 }}
        renderItem={({ item }) => (
          <View style={styles.favoriteItem}>
            <Image source={{ uri: item.image }} style={styles.favoriteLogo} />
            <Text style={styles.favoriteText}>{item.name}</Text>
            <TouchableOpacity onPress={() => removeTeam(item.name)}>
              <Text style={styles.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <FlatList
        data={teamsData}
        keyExtractor={(item) => item.name}
        numColumns={3}
        renderItem={({ item }) => {
          const selected = favorites.some((t) => t.name === item.name);
          const leaguePicked = isLeaguePicked(item.league);
          const disabled = leaguePicked && !selected;

          return (
            <TouchableOpacity
              disabled={item.name === 'Persepolis' || disabled}
              onPress={() => selectTeam(item)}
              style={[
                styles.teamCard,
                selected && styles.selected,
                disabled && styles.disabled,
              ]}
            >
              <Image source={item.image} style={styles.teamLogo} />
              <Text style={styles.teamName}>{item.name}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.Button} onPress={handleStart}>
        <Text style={styles.ButtonText}>شروع اپلیکیشن</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 15 },
  title: { color: '#fff', fontSize: 16, marginBottom: 10, textAlign: 'center', fontWeight: 'bold' },

  teamCard: {
    flex: 1,
    backgroundColor: '#2b2b2b',
    margin: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  teamLogo: { width: 30, height: 30, marginBottom: 6 },
  teamName: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  selected: {
    borderColor: '#444',
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.3,
  },
  favoriteItem: {
    backgroundColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 10,
    borderRadius: 5,
  },
  favoriteLogo: {
    width: 40,
    height: 40,
    marginRight: 6,
  },
  favoriteText: { color: '#fff', fontSize: 13, marginRight: 5 },
  removeBtn: { color: '#fff', fontSize: 16 },
  Button: {
    marginTop: 25,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
