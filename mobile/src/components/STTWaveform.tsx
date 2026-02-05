import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useDerivedValue,
} from 'react-native-reanimated';

interface STTWaveformProps {
  isActive: boolean;
  meteringLevel: number; // -60 to 0 dB
  isSpeaking: boolean;
  primaryColor: string;
  accentColor: string;
  barCount?: number;
}

const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MAX_HEIGHT = 48;
const MIN_HEIGHT = 4;

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};

const WaveformBar: React.FC<{
  index: number;
  totalBars: number;
  meteringLevel: number;
  isActive: boolean;
  primaryColor: string;
  accentColor: string;
  isSpeaking: boolean;
}> = ({ index, totalBars, meteringLevel, isActive, primaryColor, isSpeaking }) => {
  // Create variation per bar - center bars are taller
  const centerDistance = Math.abs(index - (totalBars - 1) / 2) / ((totalBars - 1) / 2);
  const barWeight = 1 - centerDistance * 0.6; // Center bars get more height

  const animatedHeight = useDerivedValue(() => {
    if (!isActive) return MIN_HEIGHT;
    // Normalize dB level: -60 to 0 → 0 to 1
    const normalized = Math.max(0, Math.min(1, (meteringLevel + 60) / 60));
    const height = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * normalized * barWeight;
    return withSpring(height, SPRING_CONFIG);
  }, [meteringLevel, isActive, barWeight]);

  const animatedOpacity = useDerivedValue(() => {
    if (!isActive) return 0.3;
    const normalized = Math.max(0, Math.min(1, (meteringLevel + 60) / 60));
    return withSpring(0.4 + normalized * 0.6, SPRING_CONFIG);
  }, [meteringLevel, isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    opacity: animatedOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: isSpeaking ? primaryColor : primaryColor,
          width: BAR_WIDTH,
        },
        animatedStyle,
      ]}
    />
  );
};

export const STTWaveform: React.FC<STTWaveformProps> = ({
  isActive,
  meteringLevel,
  isSpeaking,
  primaryColor,
  accentColor,
  barCount = 24,
}) => {
  const bars = useMemo(() => Array.from({ length: barCount }, (_, i) => i), [barCount]);

  return (
    <View style={styles.container}>
      {bars.map((index) => (
        <WaveformBar
          key={index}
          index={index}
          totalBars={barCount}
          meteringLevel={meteringLevel}
          isActive={isActive}
          primaryColor={primaryColor}
          accentColor={accentColor}
          isSpeaking={isSpeaking}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_HEIGHT + 8,
    gap: BAR_GAP,
  },
  bar: {
    borderRadius: 2,
  },
});
