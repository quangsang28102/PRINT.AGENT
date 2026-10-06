import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import sharp from "sharp";

const templateDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

const templatePathFor = (templateType) => {
  const safeType = String(templateType || "").toLowerCase();
  const fileName = safeType === "simulation" ? "simulation-result.docx" : safeType === "theory" ? "theory-result.docx" : null;
  if (!fileName) throw new Error(`Không hỗ trợ loại form: ${templateType}`);
  return path.join(templateDirectory, safeType, fileName);
};

const customTemplatePathFor = (templateType, customTemplateDirectory) => {
  const safeType = String(templateType || "").toLowerCase();
  if (safeType !== "theory" && safeType !== "simulation") throw new Error(`Không hỗ trợ loại form: ${templateType}`);
  return customTemplateDirectory ? path.join(customTemplateDirectory, `${safeType}.docx`) : null;
};

const emptyPhoto = () => sharp({
  create: { width: 150, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
}).jpeg({ quality: 70 }).toBuffer();

const formatTheoryDate = (value, includeTime = false) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).formatToParts(date).map(({ type, value: partValue }) => [type, partValue]));
  const formattedDate = `${parts.day}/${parts.month}/${parts.year}`;
  return includeTime ? `${formattedDate} ${parts.hour}:${parts.minute}` : formattedDate;
};

/** Fill the local Word form. Printing itself is delegated to Microsoft Word. */
export const renderWordTemplate = async (templateType, templateData, outputPath, options = {}) => {
  const customPath = customTemplatePathFor(templateType, options.customTemplateDirectory);
  let templateBuffer;
  if (customPath) {
    try {
      templateBuffer = await fs.readFile(customPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!templateBuffer) {
    try {
      templateBuffer = await fs.readFile(templatePathFor(templateType));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const typeName = String(templateType).toLowerCase() === "theory" ? "Lý thuyết" : "Mô phỏng";
      throw new Error(`Chưa có mẫu Word cho phần thi ${typeName}. Mở tab Cấu hình trong HPO Print Agent để tải mẫu .docx lên.`);
    }
  }
  const imageModule = new ImageModule({
    centered: true,
    getImage: async (tagValue) => {
      const value = tagValue && typeof tagValue === "object" ? tagValue.value : tagValue;
      if (!value) return emptyPhoto();
      return sharp(Buffer.from(value, "base64")).resize(113, 151, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    },
    getSize: (_image, tagValue) => [tagValue?.width || 113, tagValue?.height || 151],
  });
  const document = new Docxtemplater(new PizZip(templateBuffer), {
    delimiters: { start: "{{", end: "}}" },
    linebreaks: true,
    modules: String(templateType || "").toLowerCase() === "simulation" ? [imageModule] : [],
  });
  const renderData = String(templateType || "").toLowerCase() === "theory"
    ? {
        ...templateData,
        theory_exam_date: formatTheoryDate(templateData?.theory_exam_date),
        theory_start_time: formatTheoryDate(templateData?.theory_start_time, true),
        theory_end_time: formatTheoryDate(templateData?.theory_end_time, true),
      }
    : templateData || {};
  await document.renderAsync(renderData);
  await fs.writeFile(outputPath, document.getZip().generate({ type: "nodebuffer" }));
};
