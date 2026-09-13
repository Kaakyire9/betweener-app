import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

/** A restrained two-person boundary for consent-based private conversations. */
export const LivePrivateStageSeam = memo(function LivePrivateStageSeam() {
  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.aura} />
      <LinearGradient
        colors={['transparent', '#72C9BD24', '#D8C7F766', '#72C9BD24', 'transparent']}
        locations={[0, 0.28, 0.5, 0.72, 1]}
        style={styles.line}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: '8%',
    bottom: '8%',
    left: '50%',
    width: 12,
    marginLeft: -6,
    alignItems: 'center',
  },
  aura: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 10,
    borderRadius: 5,
    backgroundColor: '#9B7CC80A',
  },
  line: {
    width: 1,
    height: '100%',
    shadowColor: '#C6A7FF',
    shadowOpacity: 0.24,
    shadowRadius: 8,
  },
});
