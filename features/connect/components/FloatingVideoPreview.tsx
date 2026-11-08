import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { CallControlButton } from './CallControlButton';

interface Props extends React.PropsWithChildren {
  width: number; height: number; topInset: number; bottomInset: number;
  canFlip: boolean; onFlip(): void; cameraOn: boolean;
}
const constrain = (point: { x: number; y: number }, bounds: { left: number; right: number; top: number; bottom: number }) => ({
  x: Math.max(bounds.left, Math.min(bounds.right, point.x)), y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)),
});
/** A call-local overlay. Dragging changes presentation only, never camera ownership. */
export function FloatingVideoPreview({ width, height, topInset, bottomInset, canFlip, onFlip, cameraOn, children }: Props) {
  const previewHeight = Math.min(172, Math.max(108, (height - topInset - bottomInset) * 0.36));
  const previewWidth = Math.min(122, Math.max(82, width * 0.29));
  const bounds = { left: 12, right: Math.max(12, width - previewWidth - 12), top: topInset,
    bottom: Math.max(topInset, height - bottomInset - previewHeight) };
  const latest = useRef(bounds); latest.current = bounds;
  const offset = useRef(new Animated.ValueXY()).current;
  const position = useRef({ x: bounds.right, y: bounds.bottom }), start = useRef(position.current), moved = useRef(false);
  useEffect(() => {
    position.current = moved.current ? constrain(position.current, latest.current) : { x: latest.current.right, y: latest.current.bottom };
    offset.setValue(position.current);
  }, [width, height, topInset, bottomInset, offset]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.numberActiveTouches === 1 && (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
    onPanResponderGrant: () => { start.current = position.current; },
    onPanResponderMove: (_, gesture) => { moved.current = true; position.current = constrain({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy }, latest.current); offset.setValue(position.current); },
    onPanResponderTerminationRequest: () => true,
  }), [offset]);
  return <Animated.View testID="connect-self-preview" accessibilityLabel={cameraOn ? 'Your camera preview' : 'Your camera is off'}
    style={[styles.preview, { width: previewWidth, height: previewHeight, transform: offset.getTranslateTransform() }]} {...responder.panHandlers}>
    {children}
    <View style={styles.flip}><CallControlButton compact label="Switch camera" icon="camera-reverse-outline" disabled={!canFlip} onPress={onFlip} /></View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  preview: { position: 'absolute', left: 0, top: 0, borderRadius: 22, overflow: 'hidden', borderWidth: 1.5,
    borderColor: 'rgba(209,244,237,0.7)', backgroundColor: '#15282B', elevation: 8,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.35)' },
  flip: { position: 'absolute', top: 5, right: 5 },
});
