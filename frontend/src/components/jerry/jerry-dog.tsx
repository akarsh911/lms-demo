'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

export type JerryMood = 'idle' | 'listening' | 'thinking' | 'happy' | 'talking' | 'sleeping';

// Illustration colours: the character's own, fixed like a logo, not theme tokens.
const FUR = '#E9B27A';
const FUR_DARK = '#B9763F';
const EAR = '#7A4A2A';
const CREAM = '#FFF4E6';
const INK = '#2A1E18';
const COLLAR = '#B5535E';
const TAG = '#F2C14E';
const BLUSH = '#F4A3A0';

const wag = keyframes`
  0%, 100% { transform: rotate(-18deg); }
  50% { transform: rotate(22deg); }
`;
const blink = keyframes`
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
`;
const breathe = keyframes`
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-2px) scale(1.01); }
`;
const hop = keyframes`
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-26px) rotate(-3deg); }
  55% { transform: translateY(0); }
  70% { transform: translateY(-10px) rotate(2deg); }
`;
const chatter = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1); }
`;
const perk = keyframes`
  0%, 100% { transform: rotate(-24deg); }
  50% { transform: rotate(-30deg); }
`;
const perkR = keyframes`
  0%, 100% { transform: rotate(24deg); }
  50% { transform: rotate(30deg); }
`;
const drift = keyframes`
  0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: translate(18px, -40px) scale(1.2); }
`;
const think = keyframes`
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
`;

export function JerryDog({ mood, size = 260 }: { mood: JerryMood; size?: number }): React.ReactElement {
  const asleep = mood === 'sleeping';
  const tilt = mood === 'thinking' ? 'rotate(-9deg)' : mood === 'listening' ? 'rotate(5deg)' : 'none';
  const tailSpeed = mood === 'happy' ? '0.28s' : mood === 'sleeping' ? '0s' : mood === 'talking' ? '0.6s' : '0.9s';

  return (
    <Box
      sx={{
        width: size,
        height: size,
        position: 'relative',
        animation: mood === 'happy' ? `${hop} 0.9s ease-in-out infinite` : `${breathe} 3s ease-in-out infinite`,
        '& .tail': { transformOrigin: '150px 178px', animation: tailSpeed === '0s' ? 'none' : `${wag} ${tailSpeed} ease-in-out infinite` },
        '& .head': { transformOrigin: '120px 120px', transform: tilt, transition: 'transform 400ms cubic-bezier(.34,1.4,.64,1)' },
        '& .eyes': { transformOrigin: '120px 102px', animation: asleep ? 'none' : `${blink} 4s infinite` },
        '& .mouth': { transformOrigin: '120px 131px', animation: mood === 'talking' ? `${chatter} 0.22s ease-in-out infinite` : 'none' },
        '& .earL': { transformOrigin: '84px 66px', animation: mood === 'listening' ? `${perk} 0.8s ease-in-out infinite` : 'none' },
        '& .earR': { transformOrigin: '156px 66px', animation: mood === 'listening' ? `${perkR} 0.8s ease-in-out infinite` : 'none' },
        '& .zz': { animation: `${drift} 2.4s ease-out infinite` },
        '& .zz2': { animation: `${drift} 2.4s ease-out 1.2s infinite` },
        '& .dot1': { animation: `${think} 1.2s ease-in-out infinite` },
        '& .dot2': { animation: `${think} 1.2s ease-in-out 0.2s infinite` },
        '& .dot3': { animation: `${think} 1.2s ease-in-out 0.4s infinite` },
      }}
    >
      <svg viewBox="0 0 240 240" width={size} height={size} role="img" aria-label={`Jerry the dog, ${mood}`}>
        <ellipse cx="120" cy="226" rx="70" ry="8" fill={INK} opacity="0.08" />
        <path className="tail" d="M150 180 C 178 176, 192 150, 186 128 C 184 120, 176 122, 177 130 C 180 148, 168 166, 148 170 Z" fill={FUR_DARK} />
        <path d="M70 216 C 64 170, 82 140, 120 138 C 158 140, 176 170, 170 216 Z" fill={FUR} />
        <path d="M98 216 C 96 182, 104 160, 120 158 C 136 160, 144 182, 142 216 Z" fill={CREAM} />
        <ellipse cx="92" cy="216" rx="18" ry="10" fill={CREAM} />
        <ellipse cx="148" cy="216" rx="18" ry="10" fill={CREAM} />
        <path d="M84 150 Q 120 166 156 150 L 154 160 Q 120 176 86 160 Z" fill={COLLAR} />
        <circle cx="120" cy="171" r="8" fill={TAG} stroke={FUR_DARK} strokeWidth="1.5" />
        <text x="120" y="174.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={FUR_DARK} fontFamily="sans-serif">J</text>
        <g className="head">
          <g className="earL">
            <path d="M84 62 C 60 58, 44 86, 50 120 C 54 138, 72 140, 78 124 C 84 108, 92 84, 96 70 Z" fill={EAR} />
          </g>
          <g className="earR">
            <path d="M156 62 C 180 58, 196 86, 190 120 C 186 138, 168 140, 162 124 C 156 108, 148 84, 144 70 Z" fill={EAR} />
          </g>
          <ellipse cx="120" cy="100" rx="52" ry="48" fill={FUR} />
          <path d="M120 54 C 112 70, 110 86, 114 100 L 126 100 C 130 86, 128 70, 120 54 Z" fill={CREAM} />
          <ellipse cx="120" cy="124" rx="34" ry="24" fill={CREAM} />
          <ellipse cx="88" cy="118" rx="8" ry="5" fill={BLUSH} opacity="0.7" />
          <ellipse cx="152" cy="118" rx="8" ry="5" fill={BLUSH} opacity="0.7" />
          {asleep ? (
            <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
              <path d="M94 101 Q 102 107 110 101" />
              <path d="M130 101 Q 138 107 146 101" />
            </g>
          ) : (
            <g className="eyes">
              <ellipse cx="102" cy="100" rx="9" ry={mood === 'happy' ? 7 : 10} fill={INK} />
              <ellipse cx="138" cy="100" rx="9" ry={mood === 'happy' ? 7 : 10} fill={INK} />
              <circle cx="105" cy="96" r="3.2" fill="#fff" />
              <circle cx="141" cy="96" r="3.2" fill="#fff" />
              <circle cx="100" cy="104" r="1.4" fill="#fff" opacity="0.8" />
              <circle cx="136" cy="104" r="1.4" fill="#fff" opacity="0.8" />
            </g>
          )}
          {mood === 'thinking' ? (
            <g stroke={EAR} strokeWidth="3" strokeLinecap="round">
              <path d="M92 84 L 110 88" />
              <path d="M130 86 L 148 80" />
            </g>
          ) : null}
          <path d="M110 114 Q 120 108 130 114 Q 130 122 120 124 Q 110 122 110 114 Z" fill={INK} />
          <ellipse cx="116" cy="114" rx="3" ry="1.6" fill="#fff" opacity="0.6" />
          <path d="M120 124 L 120 130" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <g className="mouth">
            {mood === 'happy' || mood === 'talking' ? (
              <path d="M106 130 Q 120 150 134 130 Z" fill="#8E2F3C" />
            ) : (
              <path d="M108 130 Q 114 136 120 130 Q 126 136 132 130" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            )}
          </g>
          {mood === 'happy' || mood === 'talking' ? <ellipse cx="120" cy="140" rx="6" ry="5" fill="#E26D7A" /> : null}
        </g>
        {asleep ? (
          <g fill={FUR_DARK} fontFamily="sans-serif" fontWeight="800">
            <text className="zz" x="168" y="64" fontSize="18">z</text>
            <text className="zz2" x="182" y="50" fontSize="14">z</text>
          </g>
        ) : null}
        {mood === 'thinking' ? (
          <g fill={FUR_DARK}>
            <circle className="dot1" cx="178" cy="54" r="5" />
            <circle className="dot2" cx="194" cy="40" r="6" />
            <circle className="dot3" cx="212" cy="24" r="7" />
          </g>
        ) : null}
      </svg>
    </Box>
  );
}
