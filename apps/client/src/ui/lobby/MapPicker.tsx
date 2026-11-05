import { useRef, useState } from 'react';
import { MAX_MAP_UPLOAD_BYTES } from '@rails/shared';
import { send } from '../../net/socket.js';
import { useClient } from '../../state/store.js';
import { S } from '../strings.js';

export function MapPicker({ isHost }: { isHost: boolean }) {
  const map = useClient((s) => s.room!.map);
  const fileInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setErrors(null);
    if (file.size > MAX_MAP_UPLOAD_BYTES) {
      setErrors(`Map files are limited to ${MAX_MAP_UPLOAD_BYTES / 1_000_000} MB.`);
      return;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      setErrors('This file is not valid JSON.');
      return;
    }
    setBusy(true);
    const reply = await send({ type: 'setMap', map: doc });
    setBusy(false);
    if (!reply.ok) setErrors(reply.error);
  };

  return (
    <section className="panel">
      <h2>{S.map}</h2>
      <p>
        <strong>{map.name}</strong> {map.custom && <span className="badge">{S.customMap}</span>}
        <span className="muted">
          {' '}
          · {map.cityCount} cities · {map.routeCount} routes
        </span>
      </p>
      {isHost && (
        <div className="row">
          <button className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {S.uploadMap}
          </button>
          {map.custom && (
            <button className="secondary" disabled={busy} onClick={() => void send({ type: 'setMap', map: null })}>
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
      {errors && <pre className="error map-errors">{errors}</pre>}
    </section>
  );
}
