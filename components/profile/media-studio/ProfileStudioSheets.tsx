import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { type ProfileStoryLayer, type StudioNote, type StudioTheme, withAlpha } from './model';

type Props = {
  theme: StudioTheme;
  selectedLayer: ProfileStoryLayer | null;
  notes: StudioNote[];
  notesSheetVisible: boolean;
  onCloseLayer: () => void;
  onCloseNotes: () => void;
  onPrimaryLayerAction: (layer: ProfileStoryLayer) => void;
};

function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetShell}>{children}</View>
      </View>
    </Modal>
  );
}

export default function ProfileStudioSheets({
  theme,
  selectedLayer,
  notes,
  notesSheetVisible,
  onCloseLayer,
  onCloseNotes,
  onPrimaryLayerAction,
}: Props) {
  return (
    <>
      <BottomSheet visible={Boolean(selectedLayer)} onClose={onCloseLayer}>
        {selectedLayer ? (
          <View style={[styles.sheetCard, { backgroundColor: theme.background, borderColor: theme.outline }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{selectedLayer.label}</Text>
              <TouchableOpacity onPress={onCloseLayer} accessibilityLabel="Close layer details">
                <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sheetBody, { color: theme.textMuted }]}>{selectedLayer.description}</Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetPrimaryAction, { backgroundColor: theme.tint }]}
                onPress={() => onPrimaryLayerAction(selectedLayer)}
              >
                <Text style={styles.sheetPrimaryActionText}>{selectedLayer.actionLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetSecondaryAction, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
                onPress={onCloseLayer}
              >
                <Text style={[styles.sheetSecondaryActionText, { color: theme.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={notesSheetVisible} onClose={onCloseNotes}>
        <View style={[styles.sheetCard, { backgroundColor: theme.background, borderColor: theme.outline }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Studio notes</Text>
            <TouchableOpacity onPress={onCloseNotes} accessibilityLabel="Close studio notes">
              <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.notesSheetList}>
            {notes.map((note) => {
              const accent = note.status === 'ready' ? theme.tint : note.status === 'optional' ? theme.textMuted : theme.accent;
              return (
                <View
                  key={note.id}
                  style={[styles.notesSheetItem, { backgroundColor: theme.backgroundSubtle, borderColor: withAlpha(accent, '22') }]}
                >
                  <View style={styles.notesSheetItemHeader}>
                    <Text style={[styles.notesSheetItemTitle, { color: theme.text }]}>{note.title}</Text>
                    <View style={[styles.notesSheetStatusPill, { backgroundColor: withAlpha(accent, '12'), borderColor: withAlpha(accent, '24') }]}>
                      <Text style={[styles.notesSheetStatusText, { color: accent }]}>
                        {note.status === 'ready' ? 'Ready' : note.status === 'optional' ? 'Optional' : 'Improve'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.notesSheetItemBody, { color: theme.textMuted }]}>{note.body}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,14,20,0.42)',
  },
  sheetShell: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  sheetCard: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 16,
    gap: 14,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(120,130,140,0.32)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  sheetBody: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Manrope_500Medium',
  },
  sheetActions: {
    gap: 10,
  },
  sheetPrimaryAction: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheetPrimaryActionText: {
    color: '#07141A',
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  sheetSecondaryAction: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheetSecondaryActionText: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  notesSheetList: {
    gap: 10,
  },
  notesSheetItem: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  notesSheetItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  notesSheetItemTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  notesSheetStatusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  notesSheetStatusText: {
    fontSize: 9.5,
    fontFamily: 'Manrope_700Bold',
  },
  notesSheetItemBody: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
});
