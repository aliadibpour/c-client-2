import React from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export const HouseIcon = ({ color = "white", size = 24, outline = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="
        M4 10.5
        L12 4
        L20 10.5
        V20
        C20 20.55 19.55 21 19 21
        H15
        C14.45 21 14 20.55 14 20
        V16
        C14 15.45 13.55 15 13 15
        H11
        C10.45 15 10 15.45 10 16
        V20
        C10 20.55 9.55 21 9 21
        H5
        C4.45 21 4 20.55 4 20
        V10.5
        Z
      "
      stroke={color}
      strokeWidth={outline ? 1.7 : 0}
      fill={outline ? "none" : color}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </Svg>
);


export const TelegramIcon = ({ color = "white", size = 24, outline = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21.5 3.5L3 10.5C2 10.9 2 11.6 2.9 11.9L7.5 13.3L18 6.5C18.4 6.2 18.8 6.3 18.5 6.7L10 14.5V17L12.2 15.1L17.2 18.9C17.8 19.3 18.4 19.1 18.6 18.4L22 4.5C22.2 3.7 21.9 3.3 21.5 3.5Z"
      stroke={outline ? color : "none"}
      strokeWidth="1.4"
      fill={outline ? "none" : color}
    />
  </Svg>
);


export const ProfileIcon = ({ color = "white", size = 24, outline = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {outline ? (
      <>
        {/* Head - outline */}
        <Path
          d="M12 12C14.761 12 17 9.761 17 7C17 4.239 14.761 2 12 2C9.239 2 7 4.239 7 7C7 9.761 9.239 12 12 12Z"
          stroke={color}
          strokeWidth={1.5}
          fill="none"
        />
        {/* Body - outline */}
        <Path
          d="M4 20C4 16.686 7.134 14 13 14H13C16.866 14 20 16.686 20 20"
          stroke={color}
          strokeWidth={1.5}
          fill="none"
        />
      </>
    ) : (
      <>
        {/* Head - filled */}
        <Path
          d="M12 12C14.761 12 17 9.761 17 7C17 4.239 14.761 2 12 2C9.239 2 7 4.239 7 7C7 9.761 9.239 12 12 12Z"
          fill={color}
        />
        {/* Body - filled (solid shape) */}
        <Path
          d="M2 21C2 16.582 6.03 13 12 13C17.97 13 22 16.582 22 21C22 21.553 21.553 22 21 22H3C2.447 22 2 21.553 2 21Z"
          fill={color}
        />
      </>
    )}
  </Svg>
);


export const CommentsIcon = ({ color = "white", size = 24, outline = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 4H20C21.1 4 22 4.9 22 6V16C22 17.1 21.1 18 20 18H7L2 22V6C2 4.9 2.9 4 4 4Z"
      stroke={color}
      strokeWidth={outline ? 1.5 : 0}
      fill={outline ? "none" : color}
    />
  </Svg>
);


export const FootballPitchIcon = ({ color = "white", size = 24, outline = false }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        {outline ? (
            <>
                <Rect x="2" y="4" width="20" height="16" fill="white" rx="2" />
                <Line x1="12" y1="4" x2="12" y2="20" stroke="black" strokeWidth="1.5" />
                <Circle cx="12" cy="12" r="3.5" stroke="black" strokeWidth="1.5" fill="white" />
                <Rect x="2" y="8" width="3.5" height="8" stroke="black" strokeWidth="1.5" fill="none" />
                <Rect x="18.5" y="8" width="3.5" height="8" stroke="black" strokeWidth="1.5" fill="none" />
            </>
        ) : (
            <>
                <Rect x="2" y="4" width="20" height="16" stroke={color} strokeWidth="1.2" fill="none" rx="2" />
                <Circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="1.2" fill="none" />
                <Line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth="1.2" />
                <Rect x="2" y="8" width="3.5" height="8" stroke={color} strokeWidth="1.2" fill="none" />
                <Rect x="18.5" y="8" width="3.5" height="8" stroke={color} strokeWidth="1.2" fill="none" />
            </>
        )}
    </Svg>
);