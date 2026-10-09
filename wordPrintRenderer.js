import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import sharp from "sharp";

const templateDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

const theoryVariants = {
  "theory-b-30": { label: "Lý thuyết hạng B (30 câu)", fileName: "theory-b-30.docx", defaultFileName: "theory-b-30-result.docx" },
  "theory-c1-35": { label: "Lý thuyết hạng C1 (35 câu)", fileName: "theory-c1-35.docx", defaultFileName: "theory-c1-35-result.docx" },
};

const theoryVariantFromLicense = (licenseType) => {
  const normalized = String(licenseType || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!normalized) return null;
  return normalized.includes("C1") ? "theory-c1-35" : "theory-b-30";
};

const resolveTheoryVariant = (templateVariant, templateData) => {
  const licenseVariant = theoryVariantFromLicense(templateData?.theory_license_type);
  if (templateVariant && !theoryVariants[templateVariant]) {
    throw new Error(`Không hỗ trợ mẫu lý thuyết: ${templateVariant}`);
  }
  if (templateVariant && licenseVariant && templateVariant !== licenseVariant) {
    throw new Error("Hạng học viên không khớp với loại mẫu Word được chọn.");
  }
  return templateVariant || licenseVariant;
};

const templatePathFor = (templateType, templateVariant) => {
  const safeType = String(templateType || "").toLowerCase();
  if (safeType === "simulation") return path.join(templateDirectory, "simulation", "simulation-result.docx");
  if (safeType === "theory") {
    const fileName = templateVariant ? theoryVariants[templateVariant].defaultFileName : "theory-result.docx";
    return path.join(templateDirectory, "theory", fileName);
  }
  throw new Error(`Không hỗ trợ loại form: ${templateType}`);
};

const customTemplatePathFor = (templateType, templateVariant, customTemplateDirectory) => {
  const safeType = String(templateType || "").toLowerCase();
  if (!customTemplateDirectory) return null;
  if (safeType === "simulation") return path.join(customTemplateDirectory, "simulation.docx");
  if (safeType === "theory") {
    const fileName = templateVariant ? theoryVariants[templateVariant].fileName : "theory.docx";
    return path.join(customTemplateDirectory, fileName);
  }
  throw new Error(`Không hỗ trợ loại form: ${templateType}`);
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
  const safeType = String(templateType || "").toLowerCase();
  const templateVariant = safeType === "theory"
    ? resolveTheoryVariant(options.templateVariant, templateData)
    : undefined;
  const customPath = customTemplatePathFor(templateType, templateVariant, options.customTemplateDirectory);
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
      templateBuffer = await fs.readFile(templatePathFor(templateType, templateVariant));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const typeName = safeType === "theory"
        ? templateVariant
          ? theoryVariants[templateVariant].label
          : "Lý thuyết"
        : "Mô phỏng";
      throw new Error(`Chưa có mẫu Word cho phần thi ${typeName}. Mở tab Cấu hình mẫu in trong HPO Print Agent để tải mẫu .docx lên.`);
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
  const templateZip = new PizZip(templateBuffer);
  const documentXml = templateZip.file("word/document.xml")?.asText() || "";
  const documentText = documentXml.replace(/<[^>]+>/g, "");
  const imageTag = safeType === "theory" ? "{{%theory_image}}" : "{{%simulation_image}}";
  const document = new Docxtemplater(templateZip, {
    delimiters: { start: "{{", end: "}}" },
    linebreaks: true,
    modules: documentText.includes(imageTag) ? [imageModule] : [],
  });
  const renderData = String(templateType || "").toLowerCase() === "theory"
    ? {
        ...templateData,
        theory_image: templateData?.theory_image || { value: null, width: 113, height: 151 },
        theory_exam_date: formatTheoryDate(templateData?.theory_exam_date),
        theory_start_time: formatTheoryDate(templateData?.theory_start_time, true),
        theory_end_time: formatTheoryDate(templateData?.theory_end_time, true),
      }
    : templateData || {};
  await document.renderAsync(renderData);
  await fs.writeFile(outputPath, document.getZip().generate({ type: "nodebuffer" }));
};
