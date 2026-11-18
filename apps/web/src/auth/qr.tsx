import { encode } from 'uqr';

/** A QR code as an SVG: dark modules on a white card, because scanners need the contrast. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { data, size } = encode(text, { ecc: 'M', border: 0 });
  const quiet = 3;
  let path = '';
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) {
        path += `M${String(x + quiet)} ${String(y + quiet)}h1v1h-1z`;
      }
    });
  });
  const full = size + quiet * 2;
  return (
    <svg
      aria-label={label}
      height={196}
      role="img"
      shapeRendering="crispEdges"
      style={{ borderRadius: 8, display: 'block' }}
      viewBox={`0 0 ${String(full)} ${String(full)}`}
      width={196}
    >
      <rect fill="#ffffff" height={full} width={full} />
      <path d={path} fill="#0d1117" />
    </svg>
  );
}
