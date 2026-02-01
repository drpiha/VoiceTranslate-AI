import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface GlassmorphicCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  borderColor?: string;
  backgroundColor?: string;
  borderWidth?: number;
}

export const GlassmorphicCard: React.FC<GlassmorphicCardProps> = ({
  children,
  style,
  borderColor = 'rgba(99, 102, 241, 0.2)',
  backgroundColor = 'rgba(26, 26, 46, 0.8)',
  borderWidth = 1,
}) => {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor,
          borderWidth,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});
