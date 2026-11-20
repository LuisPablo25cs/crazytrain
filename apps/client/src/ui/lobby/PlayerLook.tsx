import { useEffect, useRef, useState } from 'react';
import { CHAR_SIGN, PLAYER_SIGNS, isValidSign, lastGrapheme, type RoomView, type SeatView } from '@rails/shared';
import { typedChar } from '../../board/playerMarks.js';
import { sendOrToast } from '../../net/socket.js';
import { useTheme } from '../../theme/ThemeProvider.js';
import { playerHex } from '../../theme/themes.js';
import { SignIcon } from '../hud/classic/SignIcon.js';
import { T, colorName } from '../strings.js';

/** Colors closer than this (straight-line distance in RGB, 0–441) are too easy to confuse on the board. */
const MIN_DISTANCE = 60;

const toRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: [number, number, number]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const distance = (a: string, b: string) => {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/**
 * How a player looks on the board: a sign (on every train roof and plaque) and a color, picked from
 * the palette or mixed with red, green and blue sliders. Others' choices are shown as taken.
 */
export function PlayerLook({ room, me }: { room: RoomView; me: SeatView }) {
  const { theme } = useTheme();
  const L = T.lobby;
  const others = room.seats.filter((s) => s.id !== me.id);
  const myHex = playerHex(theme, me.color);
  const [rgb, setRgb] = useState(toRgb(myHex));
  const [hexDraft, setHexDraft] = useState(myHex);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Follow the server (a palette pick, or a change made in another window).
  useEffect(() => {
    setRgb(toRgb(myHex));
    setHexDraft(myHex);
  }, [myHex]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const myChar = typedChar(me.sign);
  const [typed, setTyped] = useState(myChar ?? '');
  useEffect(() => setTyped(myChar ?? ''), [myChar]);
  const typedOwner = typed ? others.find((s) => s.sign === CHAR_SIGN + typed) : undefined;
  const typeSign = (text: string) => {
    // The newest character typed wins, so typing over the box simply swaps the sign.
    const last = lastGrapheme(text.trim());
    setTyped(last);
    const sign = CHAR_SIGN + last;
    if (last && isValidSign(sign) && sign !== me.sign && !others.some((s) => s.sign === sign)) {
      void sendOrToast({ type: 'setSign', sign });
    }
  };

  const mixed = toHex(rgb);
  const clash = others.find((s) => distance(playerHex(theme, s.color), mixed) < MIN_DISTANCE);

  const send = (hex: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const near = others.find((s) => distance(playerHex(theme, s.color), hex) < MIN_DISTANCE);
      if (!near && hex !== myHex) void sendOrToast({ type: 'setColor', color: hex });
    }, 250);
  };
  const setChannel = (i: number, v: number) => {
    const next = [...rgb] as [number, number, number];
    next[i] = Math.max(0, Math.min(255, Math.round(v) || 0));
    setRgb(next);
    setHexDraft(toHex(next));
    send(toHex(next));
  };
  const channels = [
    { label: L.red, short: 'R', tint: '#c5402f' },
    { label: L.green, short: 'G', tint: '#3f9a4a' },
    { label: L.blue, short: 'B', tint: '#2f6fc5' },
  ];

  return (
    <div className="lobby-box lobby-look">
      <div className="lobby-look-preview">
        <span className="lobby-look-chip" style={{ background: mixed }}>
          <SignIcon sign={me.sign} hex={mixed} size={34} />
        </span>
        <span>
          <span className="nx-caps">{L.yourLook}</span>
          <span className="lobby-look-name">{me.name}</span>
        </span>
      </div>

      <span className="nx-caps" id="lobby-sign">
        {L.yourSign}
      </span>
      <div className="lobby-signs" role="radiogroup" aria-labelledby="lobby-sign">
        {PLAYER_SIGNS.map((sign) => {
          const owner = others.find((s) => s.sign === sign);
          const label = owner ? L.signTaken(L.signs[sign], owner.name) : L.signs[sign];
          return (
            <button
              key={sign}
              role="radio"
              aria-checked={me.sign === sign}
              aria-label={label}
              title={label}
              disabled={!!owner}
              className={`lobby-sign ${me.sign === sign ? 'on' : ''}`}
              onClick={() => void sendOrToast({ type: 'setSign', sign })}
            >
              <SignIcon sign={sign} hex={mixed} ink={owner ? '#5d6b6e' : me.sign === sign ? undefined : '#e7dbbd'} size={20} />
            </button>
          );
        })}
      </div>

      <label className={`lobby-typed ${myChar ? 'on' : ''}`}>
        <span className="lobby-typed-text">
          <strong>{L.typeOwn}</strong>
          <span>{typedOwner ? L.signTaken(typed, typedOwner.name) : L.typeOwnHelp}</span>
        </span>
        <input
          value={typed}
          placeholder="A"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!typedOwner}
          onFocus={(e) => e.target.select()}
          onChange={(e) => typeSign(e.target.value.slice(-16))}
        />
      </label>

      <span className="nx-caps" id="lobby-color">
        {L.yourColor}
      </span>
      <div className="lobby-colors" role="radiogroup" aria-labelledby="lobby-color">
        {room.limits.playerColors.map((c) => {
          const owner = others.find((s) => s.color === c);
          const hex = playerHex(theme, c);
          const label = owner ? L.takenBy(colorName(c), owner.name) : colorName(c);
          return (
            <button
              key={c}
              role="radio"
              aria-checked={me.color === c}
              aria-label={label}
              title={label}
              disabled={!!owner}
              className={`lobby-swatch ${me.color === c ? 'on' : ''}`}
              style={{ background: hex }}
              onClick={() => void sendOrToast({ type: 'setColor', color: c })}
            >
              <SignIcon sign={me.sign} hex={hex} size={18} />
            </button>
          );
        })}
      </div>

      <div className="lobby-mixer" role="group" aria-label={L.mixColor}>
        <span className="nx-caps">{L.mixColor}</span>
        {channels.map((ch, i) => (
          <label key={ch.short} className="lobby-channel">
            <span aria-hidden="true" style={{ color: ch.tint }}>
              {ch.short}
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={rgb[i]}
              aria-label={ch.label}
              style={{
                background: `linear-gradient(to right, ${toHex(rgb.map((v, k) => (k === i ? 0 : v)) as [number, number, number])}, ${toHex(rgb.map((v, k) => (k === i ? 255 : v)) as [number, number, number])})`,
              }}
              onChange={(e) => setChannel(i, Number(e.target.value))}
            />
            <input
              type="number"
              min={0}
              max={255}
              inputMode="numeric"
              value={rgb[i]}
              aria-label={ch.label}
              onChange={(e) => setChannel(i, Number(e.target.value))}
            />
          </label>
        ))}
        <label className="lobby-channel hex">
          <span aria-hidden="true">#</span>
          <input
            value={hexDraft.slice(1)}
            maxLength={6}
            spellCheck={false}
            aria-label={L.hexCode}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase();
              setHexDraft('#' + v);
              if (v.length === 6) {
                setRgb(toRgb('#' + v));
                send('#' + v);
              }
            }}
          />
        </label>
        {clash && (
          <p className="lobby-clash" role="alert">
            {L.tooClose(clash.name)}
          </p>
        )}
      </div>
      <p className="lobby-note">{L.markNote}</p>
    </div>
  );
}
