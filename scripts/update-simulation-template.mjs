import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const templatePath = path.join(projectDirectory, "templates", "simulation", "simulation-result.docx");
const imageTag = "{{%simulation_image}}";
const noBorders = "<w:tcBorders><w:top w:val=\"nil\"/><w:left w:val=\"nil\"/><w:bottom w:val=\"nil\"/><w:right w:val=\"nil\"/><w:insideH w:val=\"nil\"/><w:insideV w:val=\"nil\"/></w:tcBorders>";

const zip = new PizZip(await fs.readFile(templatePath));
const documentFile = zip.file("word/document.xml");
if (!documentFile) throw new Error("Mẫu Mô phỏng thiếu word/document.xml.");

const documentXml = documentFile.asText();
const imageTagPosition = documentXml.indexOf(imageTag);
if (imageTagPosition < 0 || documentXml.indexOf(imageTag, imageTagPosition + imageTag.length) >= 0) {
  throw new Error("Mẫu Mô phỏng phải có đúng một vị trí {{%simulation_image}}.");
}

const cellStart = documentXml.lastIndexOf("<w:tc>", imageTagPosition);
const cellEnd = documentXml.indexOf("</w:tc>", imageTagPosition) + "</w:tc>".length;
if (cellStart < 0 || cellEnd < "</w:tc>".length) throw new Error("Không tìm thấy ô ảnh trong mẫu Mô phỏng.");

const imageCell = documentXml.slice(cellStart, cellEnd);
const cellProperties = imageCell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0];
if (!cellProperties) throw new Error("Ô ảnh trong mẫu Mô phỏng thiếu w:tcPr.");

const updatedCellProperties = cellProperties.includes("<w:tcBorders>")
  ? cellProperties.replace(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/, noBorders)
  : cellProperties.replace("</w:tcPr>", `${noBorders}</w:tcPr>`);
const updatedCell = imageCell.replace(cellProperties, updatedCellProperties);
const updatedXml = `${documentXml.slice(0, cellStart)}${updatedCell}${documentXml.slice(cellEnd)}`;

zip.file("word/document.xml", updatedXml);
await fs.writeFile(templatePath, zip.generate({ type: "nodebuffer" }));
console.log(`Updated the simulation photo placeholder in ${templatePath}`);
