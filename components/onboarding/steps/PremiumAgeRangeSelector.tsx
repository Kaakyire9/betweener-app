import { haptics } from "@/lib/haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";

type Props = {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  styles: any;
  onChange: (min: number, max: number) => void;
};

type Thumb = "min" | "max";

export function PremiumAgeRangeSelector({ min, max, valueMin, valueMax, styles, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeThumb, setActiveThumb] = useState<Thumb | null>(null);
  const trackWidthRef = useRef(0);
  const boundsRef = useRef({ min, max });
  const valuesRef = useRef({ valueMin, valueMax });
  const startRef = useRef({ valueMin, valueMax });
  const onChangeRef = useRef(onChange);
  const lastHapticRef = useRef({ min: valueMin, max: valueMax });

  useEffect(() => { trackWidthRef.current = trackWidth; }, [trackWidth]);
  useEffect(() => { boundsRef.current = { min, max }; }, [max, min]);
  useEffect(() => { valuesRef.current = { valueMin, valueMax }; }, [valueMax, valueMin]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));

  const updateThumb = (thumb: Thumb, next: number) => {
    const bounds = boundsRef.current;
    const values = valuesRef.current;
    const rounded = Math.round(next);
    const nextValue = thumb === "min"
      ? clamp(rounded, bounds.min, values.valueMax)
      : clamp(rounded, values.valueMin, bounds.max);
    if (lastHapticRef.current[thumb] !== nextValue) {
      lastHapticRef.current[thumb] = nextValue;
      void haptics.tap();
    }
    onChangeRef.current(
      thumb === "min" ? nextValue : values.valueMin,
      thumb === "max" ? nextValue : values.valueMax,
    );
  };

  const createPanResponder = (thumb: Thumb) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      startRef.current = { ...valuesRef.current };
      setActiveThumb(thumb);
    },
    onPanResponderMove: (_event, gesture) => {
      const width = trackWidthRef.current;
      const bounds = boundsRef.current;
      if (!width || bounds.max <= bounds.min) return;
      const delta = (gesture.dx / width) * (bounds.max - bounds.min);
      updateThumb(thumb, startRef.current[thumb === "min" ? "valueMin" : "valueMax"] + delta);
    },
    onPanResponderRelease: () => setActiveThumb(null),
    onPanResponderTerminate: () => setActiveThumb(null),
  });

  const minPan = useRef(createPanResponder("min")).current;
  const maxPan = useRef(createPanResponder("max")).current;
  const range = Math.max(1, max - min);
  const minPosition = trackWidth ? ((valueMin - min) / range) * trackWidth : 0;
  const maxPosition = trackWidth ? ((valueMax - min) / range) * trackWidth : 0;
  const thumbSize = 34;

  const adjust = (thumb: Thumb, direction: number) => {
    setActiveThumb(thumb);
    updateThumb(thumb, (thumb === "min" ? valueMin : valueMax) + direction);
    setActiveThumb(null);
  };

  return (
    <View>
      <View style={styles.ageRangeHero}>
        <View style={styles.ageRangeHeroIcon}>
          <MaterialCommunityIcons name="compass-rose" size={22} color={styles.tokens.accent.color} />
        </View>
        <View style={styles.ageRangeHeroCopy}>
          <Text style={styles.ageRangeEyebrow}>YOUR PREFERRED RANGE</Text>
          <Text style={styles.ageRangeHeroValue}>{valueMin} – {valueMax}</Text>
        </View>
        <View style={styles.ageRangeYearsPill}>
          <Text style={styles.ageRangeYearsText}>years</Text>
        </View>
      </View>

      <View style={styles.ageSliderCard}>
        <View
          style={[styles.ageSliderLayout, { paddingHorizontal: thumbSize / 2 }]}
          onLayout={(event) => setTrackWidth(Math.max(0, event.nativeEvent.layout.width - thumbSize))}
        >
          <View style={styles.ageSliderTrackArea}>
            <View style={[styles.ageSliderTrack, { width: trackWidth }]} />
            <View
              style={[
                styles.ageSliderFill,
                { left: thumbSize / 2 + minPosition, width: Math.max(0, maxPosition - minPosition) },
              ]}
            />
            {activeThumb ? (
              <View
                pointerEvents="none"
                style={[
                  styles.ageSliderBubble,
                  { left: thumbSize / 2 + (activeThumb === "min" ? minPosition : maxPosition) - 24 },
                ]}
              >
                <Text style={styles.ageSliderBubbleText}>{activeThumb === "min" ? valueMin : valueMax}</Text>
              </View>
            ) : null}
            <View
              {...minPan.panHandlers}
              style={[
                styles.ageSliderThumb,
                activeThumb === "min" && styles.ageSliderThumbActive,
                { left: thumbSize / 2 + minPosition - thumbSize / 2, width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2 },
              ]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`Minimum preferred age, ${valueMin}`}
              accessibilityValue={{ min, max: valueMax, now: valueMin }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => adjust("min", event.nativeEvent.actionName === "increment" ? 1 : -1)}
            >
              <View style={styles.ageSliderThumbCore} />
            </View>
            <View
              {...maxPan.panHandlers}
              style={[
                styles.ageSliderThumb,
                activeThumb === "max" && styles.ageSliderThumbActive,
                { left: thumbSize / 2 + maxPosition - thumbSize / 2, width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2 },
              ]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`Maximum preferred age, ${valueMax}`}
              accessibilityValue={{ min: valueMin, max, now: valueMax }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => adjust("max", event.nativeEvent.actionName === "increment" ? 1 : -1)}
            >
              <View style={styles.ageSliderThumbCore} />
            </View>
          </View>
          <View style={styles.ageSliderLabels}>
            <Text style={styles.ageSliderLabel}>{min}</Text>
            <Text style={styles.ageSliderLabel}>{max}</Text>
          </View>
        </View>
      </View>

      <View style={styles.ageRangeQuickRow}>
        {[5, 8, 12].map((spread) => (
          <Pressable
            key={spread}
            style={styles.ageRangeQuickButton}
            onPress={() => {
              const centre = Math.round((valueMin + valueMax) / 2);
              onChange(clamp(centre - Math.floor(spread / 2), min, max), clamp(centre + Math.ceil(spread / 2), min, max));
            }}
          >
            <Text style={styles.ageRangeQuickText}>±{Math.ceil(spread / 2)} years</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.ageRangeReassurance}>
        <MaterialCommunityIcons name="tune-variant" size={17} color={styles.tokens.muted.color} />
        <Text style={styles.ageRangeReassuranceText}>This shapes discovery, and you can adjust it anytime.</Text>
      </View>
    </View>
  );
}
