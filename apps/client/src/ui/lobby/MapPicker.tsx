import { useRef, useState } from 'react';
import { MAX_MAP_UPLOAD_BYTES } from '@rails/shared';
import { send } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { S, T, tr } from '../strings.js';
import { BACKDROP } from './Home.js';

export function MapPicker({ isHost }: { isHost: boolean }) {
  const map = useClient((s) => s.room!.map);
  const fileInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setErrors(null);
    if (file.size > MAX_MAP_UPLOAD_BYTES) {
      setErrors(T.misc.tooBig(MAX_MAP_UPLOAD_BYTES / 1_000_000));
      return;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      setErrors(T.misc.badJson);
      return;
    }
    setBusy(true);
    const reply = await send({ type: 'setMap', map: doc });
    setBusy(false);
    if (!reply.ok) setErrors(tr(reply.error));
  };

  return (
    <section className="lobby-box lobby-map" aria-label={S.map}>
      {!map.custom && <img src={BACKDROP} alt="" className="lobby-map-preview" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
      <div className="lobby-map-text">
        <span className="nx-caps">{T.lobby.map}</span>
        <strong>
          {map.name} {map.custom && <span className="lobby-badge">{S.customMap}</span>}
        </strong>
        <span>{T.lobby.mapStats(map.cityCount, map.routeCount)}</span>
      </div>
      {isHost && (
        <div className="lobby-map-actions">
          <button className="nx-btn outline light" disabled={busy} onClick={() => fileInput.current?.click()}>
            {S.uploadMap}
          </button>
          {map.custom && (
            <button className="nx-btn outline light" disabled={busy} onClick={() => void send({ type: 'setMap', map: null })}>
              {S.starterMap}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
        </div>
      )}
      {errors && <pre className="start-error map-errors">{errors}</pre>}
    </section>
  );
}
