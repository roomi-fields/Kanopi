// Zero-padded bar/beat formatters for the transport readouts (bar·beat·phase).
// Shared by every panel that shows the Kronos position (Statusbar, the topbar
// TransportCluster, the inspector) so a format change lands in ONE place instead
// of drifting between three identical copies.

/** Two-digit zero-pad (beats, phase): `1` → `"01"`. */
export function fmt2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Three-digit zero-pad (bars): `7` → `"007"`. */
export function fmt3(n: number): string {
  return n.toString().padStart(3, '0');
}
