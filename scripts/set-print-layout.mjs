import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const templateFiles = [
  path.join(projectDirectory, "templates", "theory", "theory-b-30-result.docx"),
  path.join(projectDirectory, "templates", "theory", "theory-c1-35-result.docx"),
  path.join(projectDirectory, "templates", "simulation", "simulation-result.docx"),
];
const a4Width = "11906";
const a4Height = "16838";
const trayOneSource = 1;

const setAttribute = (tag, name, value) => {
  const attribute = new RegExp(`\\s+w:${name}="[^"]*"`);
  return attribute.test(tag)
    ? tag.replace(attribute, ` w:${name}="${value}"`)
    : tag.replace(/\/?\s*>$/, (ending) => ` w:${name}="${value}"${ending}`);
};

for (const templatePath of templateFiles) {
  const zip = new PizZip(await fs.readFile(templatePath));
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error(`Thiếu word/document.xml trong ${templatePath}`);

  let sectionCount = 0;
  const updatedXml = documentFile.asText().replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, (section) => {
    sectionCount += 1;
    const pageSize = section.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0];
    if (!pageSize) throw new Error(`Thiếu khổ giấy trong section của ${templatePath}`);
    if (!new RegExp(`w:w="${a4Width}"`).test(pageSize) || !new RegExp(`w:h="${a4Height}"`).test(pageSize)) {
      throw new Error(`Section trong ${templatePath} chưa phải A4 dọc; không tự đổi kích thước trang.`);
    }

    let updatedSection = section.replace(pageSize, setAttribute(pageSize, "orient", "portrait"));
    const paperSource = `<w:paperSrc w:first="${trayOneSource}" w:other="${trayOneSource}"/>`;
    if (/<w:paperSrc\b[^>]*\/?\s*>/.test(updatedSection)) {
      updatedSection = updatedSection.replace(/<w:paperSrc\b[^>]*\/?\s*>/, paperSource);
    } else if (updatedSection.includes("</w:pgMar>")) {
      updatedSection = updatedSection.replace("</w:pgMar>", `</w:pgMar>${paperSource}`);
    } else {
      const updatedPageSize = updatedSection.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0];
      if (!updatedPageSize) throw new Error(`Không thể đặt Tray 1 cho ${templatePath}`);
      updatedSection = updatedSection.replace(updatedPageSize, `${updatedPageSize}${paperSource}`);
    }
    return updatedSection;
  });

  if (!sectionCount) throw new Error(`Không tìm thấy section trong ${templatePath}`);
  zip.file("word/document.xml", updatedXml);
  await fs.writeFile(templatePath, zip.generate({ type: "nodebuffer" }));
  console.log(`Set A4 portrait and printer Tray 1 in ${path.relative(projectDirectory, templatePath)}`);
}
