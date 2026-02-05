import React, { useRef, useEffect } from 'react';
import { View, TextInput, Text, ScrollView, StyleSheet } from 'react-native';

interface TranscriptEditorProps {
  transcript: string;
  onEdit: (text: string) => void;
  isEditable: boolean;
  placeholder?: string;
  textColor: string;
  placeholderColor: string;
  backgroundColor: string;
  borderColor: string;
  accentColor: string;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  transcript,
  onEdit,
  isEditable,
  placeholder = 'Tap Record to start transcribing...',
  textColor,
  placeholderColor,
  backgroundColor,
  borderColor,
  accentColor,
}) => {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Auto-scroll to bottom when transcript updates
    if (transcript && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [transcript]);

  const charCount = transcript.length;

  return (
    <View style={[styles.container, { backgroundColor, borderColor, borderWidth: 1 }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={[styles.textInput, { color: textColor }]}
          value={transcript}
          onChangeText={onEdit}
          editable={isEditable}
          multiline
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          textAlignVertical="top"
          scrollEnabled={false}
        />
      </ScrollView>
      {charCount > 0 && (
        <View style={styles.charCountContainer}>
          <Text style={[styles.charCount, { color: placeholderColor }]}>
            {charCount.toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    minHeight: 120,
    maxHeight: 240,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  charCountContainer: {
    position: 'absolute',
    bottom: 8,
    right: 12,
  },
  charCount: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
