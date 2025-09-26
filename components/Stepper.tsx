import React from "react";
import { StyleSheet, Text, View } from "react-native";

type StepperProps = {
  steps: string[];
  currentStep: number; // 0-based index
};

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep }) => {
  return (
    <View style={styles.container}>
      {steps.map((step, idx) => (
        <React.Fragment key={step}>
          <View style={styles.stepContainer}>
            <View
              style={[
                styles.circle,
                idx <= currentStep ? styles.circleActive : styles.circleInactive,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  idx <= currentStep ? styles.stepNumberActive : styles.stepNumberInactive,
                ]}
              >
                {idx + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.label,
                idx === currentStep ? styles.labelActive : styles.labelInactive,
              ]}
            >
              {step}
            </Text>
          </View>
          {idx < steps.length - 1 && (
            <View
              style={[
                styles.line,
                idx < currentStep ? styles.lineActive : styles.lineInactive,
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    justifyContent: "center",
  },
  stepContainer: {
    alignItems: "center",
    width: 60,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 2,
  },
  circleActive: {
    backgroundColor: "#0FBAB5",
    borderColor: "#0FBAB5",
  },
  circleInactive: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  stepNumber: {
    fontWeight: "bold",
    fontSize: 16,
  },
  stepNumberActive: {
    color: "#fff",
  },
  stepNumberInactive: {
    color: "#64748B",
  },
  label: {
    fontSize: 12,
    textAlign: "center",
  },
  labelActive: {
    color: "#0FBAB5",
    fontWeight: "bold",
  },
  labelInactive: {
    color: "#64748B",
  },
  line: {
    height: 2,
    width: 24,
    backgroundColor: "#CBD5E1",
    marginBottom: 18,
  },
  lineActive: {
    backgroundColor: "#0FBAB5",
  },
  lineInactive: {
    backgroundColor: "#CBD5E1",
  },
});