import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Opens the "new item" dialog when the page is reached with ?new=1 (dashboard quick actions),
 * then drops the parameter so a reload or the back button does not open it again.
 */
export const useNewParam = (enabled: boolean, open: () => void) => {
  const [params, setParams] = useSearchParams();
  const openRef = useRef(open);
  openRef.current = open;
  const wantsNew = params.has("new");

  useEffect(() => {
    if (!wantsNew) {
      return;
    }
    if (enabled) {
      openRef.current();
    }
    setParams({}, { replace: true });
  }, [wantsNew, enabled, setParams]);
};
