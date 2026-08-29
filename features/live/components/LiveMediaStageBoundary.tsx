import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { logger } from '@/lib/telemetry/logger';

type LiveMediaStageBoundaryProps = PropsWithChildren<{
  resetKey: string;
  fallback?: ReactNode;
}>;

type LiveMediaStageBoundaryState = {
  failed: boolean;
};

/** Keeps a presentation failure inside the stage instead of unmounting Live. */
export class LiveMediaStageBoundary extends Component<
  LiveMediaStageBoundaryProps,
  LiveMediaStageBoundaryState
> {
  state: LiveMediaStageBoundaryState = { failed: false };

  static getDerivedStateFromError(): LiveMediaStageBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[live-media] stage-render-failed', error, {
      componentStack: info.componentStack?.slice(0, 1_000),
    });
  }

  componentDidUpdate(previous: LiveMediaStageBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Live video needs attention.</Text>
        <Text style={styles.body}>Your room is still open. Rejoin to restore the stage.</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#071512',
  },
  title: {
    color: '#FFF7EC',
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    color: '#A9B8B2',
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
});
