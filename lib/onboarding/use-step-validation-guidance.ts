import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LayoutChangeEvent, ScrollView } from "react-native";

export type StepValidationErrors = Record<string, string>;
export type StepFieldOrderMap = Record<number, readonly string[]>;

type PendingTarget = {
  step: number;
  field: string;
};

type UseStepValidationGuidanceArgs = {
  currentStep: number;
  errors: StepValidationErrors;
  fieldOrderByStep: StepFieldOrderMap;
  scrollOffset?: number;
};

const scheduleAfterLayout = (work: () => void) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(work);
  });
};

export function useStepValidationGuidance({
  currentStep,
  errors,
  fieldOrderByStep,
  scrollOffset = 24,
}: UseStepValidationGuidanceArgs) {
  const stepScrollRefs = useRef<Record<number, ScrollView | null>>({});
  const fieldOffsetsRef = useRef<Record<string, number>>({});
  const pendingTargetRef = useRef<PendingTarget | null>(null);

  const errorCount = useMemo(
    () => Object.values(errors).filter((value) => Boolean(value)).length,
    [errors],
  );

  const errorSummary = useMemo(() => {
    if (!errorCount) return null;
    if (errorCount === 1) {
      return "One required detail still needs attention. We highlighted where to finish.";
    }
    return `${errorCount} required details still need attention. We highlighted the next place to finish.`;
  }, [errorCount]);

  const tryRevealPendingTarget = useCallback(() => {
    const pending = pendingTargetRef.current;
    if (!pending || pending.step !== currentStep) return;

    const scrollView = stepScrollRefs.current[pending.step];
    const y = fieldOffsetsRef.current[`${pending.step}:${pending.field}`];

    if (!scrollView || typeof y !== "number") return;

    scrollView.scrollTo({
      y: Math.max(0, y - scrollOffset),
      animated: true,
    });
    pendingTargetRef.current = null;
  }, [currentStep, scrollOffset]);

  useEffect(() => {
    if (!errorCount) return;
    scheduleAfterLayout(tryRevealPendingTarget);
  }, [errorCount, currentStep, tryRevealPendingTarget]);

  const setStepScrollRef = useCallback((step: number, node: ScrollView | null) => {
    stepScrollRefs.current[step] = node;
  }, []);

  const onFieldLayout = useCallback((step: number, field: string, event: LayoutChangeEvent) => {
    fieldOffsetsRef.current[`${step}:${field}`] = event.nativeEvent.layout.y;
  }, []);

  const revealValidationErrors = useCallback(
    (step: number, nextErrors: StepValidationErrors) => {
      const orderedFields = fieldOrderByStep[step] ?? Object.keys(nextErrors);
      const firstInvalidField = orderedFields.find((field) => Boolean(nextErrors[field]));
      if (!firstInvalidField) return;

      pendingTargetRef.current = {
        step,
        field: firstInvalidField,
      };

      if (step === currentStep) {
        scheduleAfterLayout(tryRevealPendingTarget);
      }
    },
    [currentStep, fieldOrderByStep, tryRevealPendingTarget],
  );

  return {
    errorSummary,
    onFieldLayout,
    revealValidationErrors,
    setStepScrollRef,
  };
}
