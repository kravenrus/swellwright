/**
 * Helpers for the bytes a script wrote. The output is kept as bytes (a read may end inside a UTF-8 character, and a
 * script may print a NUL), and turned into text only when it is shown.
 */

/** Text for display: invalid UTF-8 shows as U+FFFD, and so does a NUL, which JSON and a terminal would mishandle. */
export function displayText(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .toString('utf8')
    .replaceAll('\u0000', '�');
}

/** How many bytes the UTF-8 sequence that starts with `lead` has; 1 for ASCII and for a byte that cannot start one. */
function sequenceLength(lead: number): number {
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  if (lead >= 0xe0) return lead <= 0xef ? 3 : 1;
  if (lead >= 0xc2) return lead <= 0xdf ? 2 : 1;
  return 1;
}

const isContinuation = (byte: number): boolean => (byte & 0xc0) === 0x80;

/** Drops the continuation bytes a window cut out of the middle of a character starts with. */
export function startOnBoundary(bytes: Uint8Array): Uint8Array {
  let skip = 0;
  while (skip < 3 && skip < bytes.length && isContinuation(bytes[skip] ?? 0)) {
    skip += 1;
  }
  return skip === 0 ? bytes : bytes.subarray(skip);
}

/**
 * The end (exclusive) of the longest prefix of `bytes` that does not stop inside a UTF-8 character. A prefix that ends
 * with an incomplete sequence is shortened by it; bytes that are not valid UTF-8 at all are left to the decoder.
 */
export function endOnBoundary(bytes: Uint8Array): number {
  const length = bytes.length;
  for (let back = 1; back <= 3 && back <= length; back += 1) {
    const byte = bytes[length - back] ?? 0;
    if (isContinuation(byte)) {
      continue;
    }
    // `byte` is the last lead (or ASCII) byte: the sequence is complete only if all of it is here.
    return sequenceLength(byte) > back ? length - back : length;
  }
  return length;
}

/**
 * The page `[offset, offset + limit)` of kept output, ended between two characters so that no page starts or ends
 * inside one. `window` holds the bytes from `offset` on, at least `limit` of them when that many are kept, and up to
 * three more so that a character that straddles the end of the page can be taken whole when it is the page's only
 * one. `more` says whether bytes follow the window (or the output may still grow): then an incomplete sequence at the
 * end is held back for the next page instead of being shown as a replacement character.
 */
export function pageOf(window: Uint8Array, limit: number, more: boolean): Uint8Array {
  const page = window.subarray(0, Math.min(limit, window.length));
  const reachesEnd = page.length === window.length;
  if (reachesEnd && !more) {
    return page;
  }
  const end = endOnBoundary(page);
  if (end > 0) {
    return page.subarray(0, end);
  }
  // A single character longer than the limit: give it whole, or the client would never get past it.
  const lead = page[0] ?? 0;
  return window.subarray(0, Math.min(window.length, sequenceLength(lead)));
}
