import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface GlassmorphicCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  borderColor?: string;
  backgroundColor?: string;
  borderWidth?: number;
}

// Kept name for backward compatibility, but defaults updated to solid card style
export const GlassmorphicCard: React.FC<GlassmorphicCardProps> = ({
  children,
  style,
  borderColor = 'rgba(0, 0, 0, 0.06)',
  backgroundColor = '#FFFFFF',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
});
