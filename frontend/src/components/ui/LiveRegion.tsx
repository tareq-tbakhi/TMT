/**
 * LiveRegion — screen-reader announcements for dynamic updates
 * (new alerts, connection changes, saved confirmations…).
 *
 * Mount <LiveRegionHost /> once per app shell, then call
 * `announce("3 new critical alerts")` from anywhere.
 */

import React, { useEffect, useState } from "react";

type Politeness = "polite" | "assertive";

interface Announcement {
  message: string;
  politeness: Politeness;
  id: number;
}

let counter = 0;
let listener: ((a: Announcement) => void) | null = null;

/** Announce a message to screen reader users. */
export function announce(
  message: string,
  politeness: Politeness = "polite"
): void {
  listener?.({ message, politeness, id: ++counter });
}

export const LiveRegionHost: React.FC = () => {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    listener = (a) => {
      if (a.politeness === "assertive") {
        setAssertive("");
        requestAnimationFrame(() => setAssertive(a.message));
      } else {
        setPolite("");
        requestAnimationFrame(() => setPolite(a.message));
      }
    };
    return () => {
      listener = null;
    };
  }, []);

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {polite}
      </div>
      <div aria-live="assertive" role="alert" className="sr-only">
        {assertive}
      </div>
    </>
  );
};

export default LiveRegionHost;
