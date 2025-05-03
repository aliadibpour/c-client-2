import React from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export const HouseIcon = ({ color = "white", size = 24, outline = false }) => {
    return(
        <Svg width={size} height={size} viewBox="0 0 24 24">
            {outline ? (
                <Path stroke={color} strokeWidth="1.5" fill="none" d="M11.293 3.293a1 1 0 0 1 1.414 0l6 6 2 2a1 1 0 0 1-1.414 1.414L19 12.414V19a2 2 0 0 1-2 2h-3a1 1 0 0 1-1-1v-3h-2v3a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2v-6.586l-.293.293a1 1 0 0 1-1.414-1.414l2-2 6-6Z" />
            ) : (
                <Path fill={color} fillRule="evenodd" d="M11.293 3.293a1 1 0 0 1 1.414 0l6 6 2 2a1 1 0 0 1-1.414 1.414L19 12.414V19a2 2 0 0 1-2 2h-3a1 1 0 0 1-1-1v-3h-2v3a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2v-6.586l-.293.293a1 1 0 0 1-1.414-1.414l2-2 6-6Z" clipRule="evenodd"/>
            )}
        </Svg>
    )
}

export const TelegramIcon = ({ color = "white", size = 24, outline = false }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        {outline ? (
            <Path
                stroke={color}
                strokeWidth="1."
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42l10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15l4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"
            />
        ) : (
            <Path
                fill={color}
                d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42l10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15l4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"
            />
        )}
    </Svg>
);

export const ProfileIcon = ({ color = "white", size = 24, outline = false }) => {
    return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
            {outline ? (
                <Path stroke={color} strokeWidth="1" fill="none" d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>
            ) : (
                <Path fill={color} d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>
            )}
        </Svg>
    )
}

export const CommentsIcon = ({ color = "white", size = 24, outline = false }) => {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            {outline ? (
                <Path stroke={color} strokeWidth="1.5" fill="none" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            ) : (
                <Path fill={color} d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            )}
        </Svg>
    )
}

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