import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type StepProgressBarProps = {
  currentStep: number;
  totalSteps: number;
};

const StepProgressBar = ({ currentStep, totalSteps }: StepProgressBarProps) => {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.progressBackground}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.label}>
          {currentStep} / {totalSteps}
        </Text>
      </View>
    </View>
  );
};

export default StepProgressBar;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBackground: {
    flex: 1,
    height: 7,
    backgroundColor: '#555',
    marginRight: 10,
    borderRadius: 3,
    overflow: "hidden"
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
    position: "absolute",
    right:0
  },
  label: {
    fontSize: 14,
    color: '#888',
    fontWeight: '800',
  },
});
