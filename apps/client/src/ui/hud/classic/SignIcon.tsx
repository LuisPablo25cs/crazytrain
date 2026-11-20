import type { RoomView } from '@rails/shared';
import { GLYPH_FONT, markInk, markPath, typedChar } from '../../../board/playerMarks.js';

/** A player's sign (a shape or a character they typed), drawn in ink that reads on their color. */
export function SignIcon({ sign, hex, size = 16, ink }: { sign: string | number; hex: string; size?: number; ink?: string }) {
  const char = typedChar(sign);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {char ? (
        <text
          x="8"
          y="8.6"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="14"
          fontWeight="700"
          fontFamily={GLYPH_FONT}
          fill={ink ?? markInk(hex)}
        >
          {char}
        </text>
      ) : (
        <path d={markPath(sign, 16)} fill={ink ?? markInk(hex)} />
      )}
    </svg>
  );
}

/** Each player's sign by player index, from the seats that started the game. */
export function playerSigns(room: RoomView | null, count: number): (string | undefined)[] {
  return Array.from({ length: count }, (_, i) => room?.seats.find((s) => s.playerIndex === i)?.sign);
}
