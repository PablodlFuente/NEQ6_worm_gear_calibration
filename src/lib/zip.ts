/* ZIP mínimo (método store, sin compresión) para descargar el firmware */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files: { name: string; data: string | Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const dataB = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(dataB);

    const local = new Uint8Array(30 + nameB.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); /* version */
    dv.setUint16(6, 0, true); /* flags */
    dv.setUint16(8, 0, true); /* store */
    dv.setUint16(10, 0, true); /* time */
    dv.setUint16(12, 0x21, true); /* date (1980-01-01) */
    dv.setUint32(14, crc, true);
    dv.setUint32(18, dataB.length, true);
    dv.setUint32(22, dataB.length, true);
    dv.setUint16(26, nameB.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameB, 30);

    const cen = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataB.length, true);
    cv.setUint32(24, dataB.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameB, 46);

    parts.push(local, dataB);
    central.push(cen);
    offset += local.length + dataB.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: "application/zip" });
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(name: string, text: string, mime = "text/plain;charset=utf-8") {
  downloadBlob(name, new Blob([text], { type: mime }));
}
