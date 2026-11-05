import { useClient } from '../state/store.js';
import { S } from './strings.js';

/** Connection banner and toasts, shown above every screen. */
export function Overlays() {
  const connection = useClient((s) => s.connection);
  const toast = useClient((s) => s.toast);
  const inRoom = useClient((s) => s.room !== null);
  return (
    <>
      {connection === 'disconnected' && inRoom && (
        <div className="banner" role="status">
          {S.reconnecting}
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.kind}`} role="alert" key={toast.id}>
          {toast.text}
        </div>
      )}
    </>
  );
}
