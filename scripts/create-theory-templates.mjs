import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "templates", "theory");
const pageWidth = 11906;
const pageHeight = 16838;
const pageMargin = 650;
const contentWidth = pageWidth - pageMargin * 2;
const font = "Times New Roman";

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const run = (value, options = {}) => {
  const properties = [
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/>`,
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.underline ? '<w:u w:val="single"/>' : "",
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : "",
  ].join("");
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
};

const paragraph = (content = "", options = {}) => {
  const props = [
    options.align ? `<w:jc w:val="${options.align}"/>` : "",
    `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 0}" w:line="${options.line ?? 250}" w:lineRule="auto"/>`,
    options.keepNext ? "<w:keepNext/>" : "",
    options.indent ? `<w:ind w:left="${options.indent}"/>` : "",
  ].join("");
  const contentXml = Array.isArray(content) ? content.join("") : run(content, options);
  return `<w:p><w:pPr>${props}</w:pPr>${contentXml}</w:p>`;
};

const cell = (content, width, options = {}) => {
  const span = options.gridSpan ? `<w:gridSpan w:val="${options.gridSpan}"/>` : "";
  const merge = options.vMerge ? `<w:vMerge w:val="${options.vMerge}"/>` : "";
  const vertical = options.vertical ? `<w:textDirection w:val="${options.vertical}"/>` : "";
  const borders = options.borders === false
    ? "<w:tcBorders><w:top w:val=\"nil\"/><w:left w:val=\"nil\"/><w:bottom w:val=\"nil\"/><w:right w:val=\"nil\"/></w:tcBorders>"
    : "<w:tcBorders><w:top w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:left w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:bottom w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:right w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/></w:tcBorders>";
  const cellProperties = `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span}${merge}${vertical}<w:vAlign w:val="${options.vAlign || "center"}"/>${borders}${options.shading ? `<w:shd w:fill="${options.shading}"/>` : ""}</w:tcPr>`;
  const contentXml = Array.isArray(content) ? content.join("") : content;
  return `<w:tc>${cellProperties}${contentXml || paragraph("")}</w:tc>`;
};

const table = (rows, widths, options = {}) => {
  const layout = options.layout || "fixed";
  const borders = options.borders === false
    ? "<w:tblBorders><w:top w:val=\"nil\"/><w:left w:val=\"nil\"/><w:bottom w:val=\"nil\"/><w:right w:val=\"nil\"/><w:insideH w:val=\"nil\"/><w:insideV w:val=\"nil\"/></w:tblBorders>"
    : "<w:tblBorders><w:top w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:left w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:bottom w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:right w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:insideH w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/><w:insideV w:val=\"single\" w:sz=\"5\" w:color=\"222222\"/></w:tblBorders>";
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const rowXml = rows.map((row) => `<w:tr>${row.join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/><w:tblLayout w:type="${layout}"/><w:tblCellMar><w:top w:w="25" w:type="dxa"/><w:left w:w="20" w:type="dxa"/><w:bottom w:w="25" w:type="dxa"/><w:right w:w="20" w:type="dxa"/></w:tblCellMar>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
};

const infoLine = (label, placeholder) => paragraph([
  run(`${label}: `),
  run(`{{${placeholder}}}`, { bold: true }),
], { line: 290, after: 20 });

const answerTable = (firstQuestion, questionCount) => {
  const fixedColumns = [750, 750];
  const questionWidth = Math.floor((contentWidth - fixedColumns.reduce((sum, width) => sum + width, 0)) / questionCount);
  const widths = [...fixedColumns, ...Array(questionCount).fill(questionWidth)];
  widths[widths.length - 1] += contentWidth - widths.reduce((sum, width) => sum + width, 0);
  const small = { align: "center", line: 210 };
  const header = [
    cell(paragraph("Câu hỏi", { ...small, size: 18, bold: true }), fixedColumns[0] + fixedColumns[1], { gridSpan: 2 }),
    ...Array.from({ length: questionCount }, (_, index) => cell(
      paragraph(String(firstQuestion + index), { ...small, size: 17, bold: true }),
      widths[index + 2],
    )),
  ];
  const rows = [header];
  for (let answer = 1; answer <= 4; answer += 1) {
    const labelCell = answer === 1
      ? cell(paragraph("Trả lời", { ...small, size: 17, bold: true }), fixedColumns[0], { vMerge: "restart" })
      : cell(paragraph("", small), fixedColumns[0], { vMerge: "continue" });
    rows.push([
      labelCell,
      cell(paragraph(String(answer), { ...small, size: 17, bold: true }), fixedColumns[1]),
      ...Array.from({ length: questionCount }, (_, index) => {
        const questionNumber = String(firstQuestion + index).padStart(2, "0");
        return cell(paragraph(`{{theory_q${questionNumber}_a${answer}}}`, { ...small, size: 16 }), widths[index + 2]);
      }),
    ]);
  }
  return table(rows, widths);
};

const detailsBlock = () => {
  const widths = [4200, 4422, contentWidth - 8622];
  const left = [
    infoLine("Họ và tên", "theory_full_name"),
    infoLine("Ngày sinh", "theory_date_of_birth"),
    infoLine("Số định danh", "theory_identity_card"),
    infoLine("Hạng", "theory_license_type"),
    infoLine("Số báo danh", "theory_candidate_number"),
  ].join("");
  const right = [
    infoLine("Khóa sát hạch", "theory_course"),
    infoLine("Ngày sát hạch", "theory_exam_date"),
    infoLine("Thời điểm bắt đầu", "theory_start_time"),
    infoLine("Thời điểm kết thúc", "theory_end_time"),
    infoLine("Lần thi", "theory_attempt_number"),
  ].join("");
  const photo = paragraph("{{%theory_image}}", { align: "center", size: 16 });
  return table([[cell(left, widths[0], { borders: false }), cell(right, widths[1], { borders: false }), cell(photo, widths[2])]], widths, { borders: false });
};

const headerBlock = () => {
  const left = [
    paragraph("CÔNG AN TP. HỒ CHÍ MINH", { align: "center", size: 22, bold: true, after: 45 }),
    paragraph("HỘI ĐỒNG SÁT HẠCH", { align: "center", size: 22, bold: true, underline: true }),
  ].join("");
  const right = [
    paragraph("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center", size: 20, bold: true, after: 45 }),
    paragraph("Độc lập - Tự do - Hạnh phúc", { align: "center", size: 20, bold: true, underline: true }),
  ].join("");
  const half = Math.floor(contentWidth / 2);
  return table([[cell(left, half, { borders: false }), cell(right, contentWidth - half, { borders: false })]], [half, contentWidth - half], { borders: false });
};

const resultBlock = () => {
  const widths = [contentWidth];
  const pass = table([[
    cell(paragraph("Đạt", { align: "center", size: 22, bold: true }), 1300, { borders: false }),
    cell(paragraph("{{theory_passed_check}}", { align: "center", size: 22, bold: true }), 500),
    cell(paragraph("Không đạt", { align: "center", size: 22, bold: true }), 1900, { borders: false }),
    cell(paragraph("{{theory_failed_check}}", { align: "center", size: 22, bold: true }), 500),
    cell(paragraph("", { align: "center" }), contentWidth - 4200, { borders: false }),
  ]], [1300, 500, 1900, 500, contentWidth - 4200], { borders: false });
  const signatures = table([[
    cell(paragraph("Sát hạch viên ký xác nhận", { align: "center", size: 21, bold: true }), Math.floor(contentWidth / 2), { borders: false }),
    cell(paragraph("Học viên ký xác nhận kết quả", { align: "center", size: 21, bold: true }), contentWidth - Math.floor(contentWidth / 2), { borders: false }),
  ]], [Math.floor(contentWidth / 2), contentWidth - Math.floor(contentWidth / 2)], { borders: false });
  return [
    paragraph("Kết luận:", { size: 22, bold: true, before: 100, after: 50 }),
    paragraph([run("Số điểm đạt được: "), run("{{theory_score}}", { bold: true }), run(" điểm")], { size: 22, after: 40 }),
    pass,
    paragraph("", { line: 300, after: 0 }),
    signatures,
    paragraph("", { line: 650, after: 0 }),
  ].join("");
};

const documentXml = (variant, totalQuestions, splits) => {
  const title = paragraph("BIÊN BẢN SÁT HẠCH LÝ THUYẾT", { align: "center", size: 36, bold: true, before: 100, after: 140, keepNext: true });
  const legend = paragraph([
    run("GHI CHÚ: ", { bold: true }),
    run("Đ: Đáp án đúng.   X: Ý trả lời đúng.   S: Ý trả lời sai.", { italic: true }),
  ], { size: 18, before: 70, after: 45 });
  const grids = [];
  let currentQuestion = 1;
  for (const count of splits) {
    grids.push(answerTable(currentQuestion, count));
    grids.push(paragraph("", { line: 100, after: 0 }));
    currentQuestion += count;
  }
  const body = [
    headerBlock(),
    title,
    detailsBlock(),
    legend,
    ...grids,
    resultBlock(),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"/><w:pgMar w:top="480" w:right="${pageMargin}" w:bottom="480" w:left="${pageMargin}" w:header="250" w:footer="250" w:gutter="0"/><w:cols w:space="720"/></w:sectPr></w:body></w:document>`;
};

const createTemplate = (variant, totalQuestions, splits) => {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", documentXml(variant, totalQuestions, splits));
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Biên bản sát hạch lý thuyết ${variant}</dc:title><dc:subject>Mẫu ${totalQuestions} câu - khổ A4 dọc</dc:subject><dc:creator>HPO Print Agent</dc:creator></cp:coreProperties>`);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
};

await fs.mkdir(outputDirectory, { recursive: true });
const templates = [
  ["theory-b-30-result.docx", "B - 30 câu", 30, [15, 15]],
  ["theory-c1-35-result.docx", "C1 - 35 câu", 35, [17, 18]],
];
for (const [fileName, variant, count, splits] of templates) {
  await fs.writeFile(path.join(outputDirectory, fileName), createTemplate(variant, count, splits));
}
console.log(`Created ${templates.length} editable theory templates in ${outputDirectory}`);
