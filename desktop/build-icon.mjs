import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outputPath = path.resolve(process.argv[2] || "desktop/app.ico");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0d8279"/><path d="M9 9h10a6 6 0 0 1 0 12h-4v4H9zm6 5v3h4a1.5 1.5 0 0 0 0-3z" fill="white"/></svg>`;
const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();

// ICO files can contain a PNG payload; Windows uses this 256px image for shortcuts.
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Image type: ICO
header.writeUInt16LE(1, 4); // Number of images
header.writeUInt8(0, 6); // Width 256 is encoded as 0
header.writeUInt8(0, 7); // Height 256 is encoded as 0
header.writeUInt8(0, 8); // No color palette
header.writeUInt8(0, 9); // Reserved
header.writeUInt16LE(1, 10); // Color planes
header.writeUInt16LE(32, 12); // Bits per pixel
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, Buffer.concat([header, png]));
