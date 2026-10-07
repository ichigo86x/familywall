import { useEffect, useState } from "react";

import { connection, type ConnectionState } from "@/api/offline-cache";

/** Tells that the page shows data saved on this device while the server cannot be reached. */
export const OfflineBanner = () => {
  const [state, setState] = useState<ConnectionState>(connection.get);

  useEffect(() => connection.subscribe(setState), []);

  if (state.online) {
    return null;
  }
  const time = state.dataTime?.toLocaleString("it-IT", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="offline-banner" role="status">
      <span aria-hidden="true">📡</span>
      Offline: mostro i dati salvati{time ? ` (${time})` : ""}. Riprovo da solo.
    </div>
  );
};
