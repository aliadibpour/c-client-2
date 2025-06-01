import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

export default function RankTeamsScreen({ route, navigation }: any) {
  const { favorites } = route.params;

  const [round, setRound] = useState(1);
  const [firstMatchWinner, setFirstMatchWinner] = useState<any>(null);
  const [firstMatchLoser, setFirstMatchLoser] = useState<any>(null);
  const [finalWinner, setFinalWinner] = useState<any>(null);
  const [finalLoser, setFinalLoser] = useState<any>(null);

  const handleSelection = (winner: any, loser: any) => {
    if (round === 1) {
      setFirstMatchWinner(winner);
      setFirstMatchLoser(loser);
      setRound(2);
    } else if (round === 2) {
      setFinalWinner(winner);
      setFinalLoser(loser);

      // اگر هر دو مسابقه را یک تیم برد، باید مسابقه‌ی سوم اجرا شود
      if (winner === firstMatchWinner) {
        // اجرای راند سوم بین دو تیم بازنده
        setRound(3);
      } else {
        // پایان با دو راند کافی‌ست
        navigation.navigate('Home', {
          favorites,
          ranking: {
            first: winner.name,
            second: firstMatchWinner.name,
            third: firstMatchLoser.name,
          },
        });
      }
    } else if (round === 3) {
      // اینجا فقط برای تعیین دوم و سوم است
      const second = winner;
      const third = loser;
      navigation.navigate('Home', {
        favorites,
        ranking: {
          first: finalWinner.name,
          second: second.name,
          third: third.name,
        },
      });
    }
  };

  let team1: any, team2: any;
  if (round === 1) {
    [team1, team2] = [favorites[0], favorites[1]];
  } else if (round === 2) {
    team1 = firstMatchWinner;
    team2 = favorites[2];
  } else {
    // round 3
    team1 = firstMatchLoser;
    team2 = finalLoser;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {round === 1
          ? 'بین این دو تیم کدام را بیشتر دوست داری؟'
          : round === 2
          ? 'حالا این تیم را با تیم سوم مقایسه کن:'
          : 'و در آخر، این دو تیم بازنده را مقایسه کن:'}
      </Text>

      <View style={styles.matchupContainer}>
        {[team1, team2].map((team: any) => (
          <TouchableOpacity
            key={team.name}
            style={styles.teamCard}
            onPress={() => handleSelection(team, team === team1 ? team2 : team1)}
          >
            <Image source={{ uri: team.logo }} style={styles.logo} />
            <Text style={styles.teamName}>{team.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    marginBottom: 100,
    paddingTop: 80,
    alignItems: 'center',
    backgroundColor: '#000',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#fff',
    textAlign: 'center',
  },
  matchupContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  teamCard: {
    backgroundColor: '#333',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 3,
    width: 140,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
  },
  teamName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});



// {
//   "id": 123456789,
//   "chat_id": 987654321,
//   "date": 1717078900,
//   "sender_id": 12345,
//   "content": {
//     "type": "photo",
//     "caption": "🇮🇹مهدی طارمی رو نیمکت اینتر در مقابل پاری‌سن‌ژرمن",
//     "width": 1125,
//     "height": 1265,
//     "file_id": "1251",
//     "file_unique_id": "AAQC1...", // از TdApi.File.id
//     "file_size": 210134, // بایت
//     "is_downloaded": false,
//     "local_path": "", // پر میشه بعد از دانلود کامل
//     "remote_path": "..." // فقط برای برخی فایل‌ها وجود داره
//   }
// }
