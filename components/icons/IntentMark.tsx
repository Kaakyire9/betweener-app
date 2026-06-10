import { Circle, Path, Svg } from "react-native-svg";

type IntentMarkProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export default function IntentMark({
  size = 28,
  color = "currentColor",
  strokeWidth = 2.2,
}: IntentMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M8.9 22.3H8.2C5.9 22.3 4 20.4 4 18.1V10.6C4 8.3 5.9 6.4 8.2 6.4H20.1C22.4 6.4 24.3 8.3 24.3 10.6V14.9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.2 22.1L6.7 26.3L12.5 22.3H15.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.2 16.9C11.8 15.2 9.7 13.5 9.7 11.5C9.7 10.2 10.7 9.2 12 9.2C12.9 9.2 13.7 9.7 14.2 10.5C14.7 9.7 15.5 9.2 16.4 9.2C17.7 9.2 18.7 10.2 18.7 11.5C18.7 13.5 16.6 15.2 14.2 16.9Z"
        stroke={color}
        strokeWidth={Math.max(1.5, strokeWidth - 0.25)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.2 23.5H27"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24.2 20.4L27.3 23.5L24.2 26.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="22.2" cy="23.5" r="5.4" stroke={color} strokeWidth={Math.max(1.4, strokeWidth - 0.45)} opacity={0.22} />
    </Svg>
  );
}
