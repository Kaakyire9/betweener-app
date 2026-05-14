import Svg, { Circle, Path } from "react-native-svg";

type SignalIconProps = {
  size?: number;
  color?: string;
  accentColor?: string;
  active?: boolean;
  strokeWidth?: number;
};

export default function SignalIcon({
  size = 28,
  color = "#13A8A8",
  accentColor = "#8B5CFF",
  active = false,
  strokeWidth = 2.1,
}: SignalIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M10.2 19.7C7.7 16.8 7.7 12.5 10.2 9.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M21.8 9.6C24.3 12.5 24.3 16.8 21.8 19.7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M12.7 17.3C11.4 15.8 11.4 13.5 12.7 12"
        stroke={color}
        strokeWidth={Math.max(1.5, strokeWidth - 0.25)}
        strokeLinecap="round"
      />
      <Path
        d="M19.3 12C20.6 13.5 20.6 15.8 19.3 17.3"
        stroke={color}
        strokeWidth={Math.max(1.5, strokeWidth - 0.25)}
        strokeLinecap="round"
      />
      <Path
        d="M16 19.4C13.9 17.9 12.2 16.5 12.2 14.8C12.2 13.7 13.1 12.8 14.2 12.8C15 12.8 15.6 13.2 16 13.9C16.4 13.2 17 12.8 17.8 12.8C18.9 12.8 19.8 13.7 19.8 14.8C19.8 16.5 18.1 17.9 16 19.4Z"
        stroke={active ? accentColor : color}
        strokeWidth={Math.max(1.5, strokeWidth - 0.15)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="16" cy="15.2" r="8.7" stroke={accentColor} strokeWidth={1.15} opacity={active ? 0.28 : 0.16} />
      <Path
        d="M23.7 5.7L24.5 7.4L26.2 8.2L24.5 9L23.7 10.7L22.9 9L21.2 8.2L22.9 7.4L23.7 5.7Z"
        fill={accentColor}
        opacity={active ? 0.95 : 0.72}
      />
    </Svg>
  );
}
