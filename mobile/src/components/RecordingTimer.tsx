import React, { useEffect, useState, useRef } from 'react';
import { Text, StyleSheet } from 'react-native';

interface RecordingTimerProps {
  isRecording: boolean;
  textColor: string;
}

export const RecordingTimer: React.FC<RecordingTimerProps> = ({
  isRecording,
  textColor,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRecording]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <Text style={[styles.timer, { color: textColor }]}>
      {display}
    </Text>
  );
};

const styles = StyleSheet.create({
  timer: {
    fontSize: 28,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
});
