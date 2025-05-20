import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Vibration } from 'react-native';

export const Keyboard = ({ setState }: { setState: React.Dispatch<React.SetStateAction<string>> }) => {
    const keyboard = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['', '0', 'back']
    ];

    const renderKey = (digit:any) => (
        <TouchableOpacity
          key={digit}
          style={digit ? styles.keyButton : { opacity: 0, width: '30%' }}
          onPress={() => handleKeyPress(digit)}
        >
          <Text style={styles.keyText}>{digit === 'back' ? '⌫' : digit}</Text>
        </TouchableOpacity>
    );

    const handleKeyPress = (digit:any) => {
        Vibration.vibrate(10); // vibrates for 10 milliseconds
        if (digit === 'back') {
        setState((prev: any) => prev.slice(0, -1));
        } else {
        setState((prev: any) => prev + digit);
        }
    };
    
    return (
        <View style={styles.keyboard}>
            {keyboard.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keyRow}>
                {row.map(renderKey)}
            </View>
            ))}
      </View>
    )
}

const styles = StyleSheet.create({
    keyboard: {
        position: 'absolute',
        bottom: 5,
        left: 0,
        right: 0,
    },
    keyRow: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-evenly',
        marginVertical: 5,
    },
    keyButton: {
        width: '30%',
        paddingVertical: 11.7,
        borderRadius: 7,
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
    },
    keyText: {
        color: 'white',
        fontSize: 22,
    },
})