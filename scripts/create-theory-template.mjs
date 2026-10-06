import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "templates", "theory", "theory-result.docx");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const run = (text, { size = 22, color = "263B46", bold = false } = {}) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${color}"/><w:sz w:val="${size}"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

const paragraph = (runs, { align = "left", before = 0, after = 100, line = 300 } = {}) =>
  `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;

const cell = (content, width, { fill = "FFFFFF", vertical = "center", margins = 125 } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:fill="${fill}"/><w:vAlign w:val="${vertical}"/><w:tcMar><w:top w:w="${margins}" w:type="dxa"/><w:start w:w="${margins}" w:type="dxa"/><w:bottom w:w="${margins}" w:type="dxa"/><w:end w:w="${margins}" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;

const table = (rows, widths, { borders = "D7E1E5" } = {}) => {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const border = `<w:tblBorders><w:top w:val="single" w:sz="5" w:color="${borders}"/><w:left w:val="single" w:sz="5" w:color="${borders}"/><w:bottom w:val="single" w:sz="5" w:color="${borders}"/><w:right w:val="single" w:sz="5" w:color="${borders}"/><w:insideH w:val="single" w:sz="4" w:color="${borders}"/><w:insideV w:val="single" w:sz="4" w:color="${borders}"/></w:tblBorders>`;
  const body = rows.map((row) => `<w:tr>${row.map((item, index) => cell(item.xml, widths[index], item.options)).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${border}<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:start w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:end w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
};

const label = (value) => ({ xml: paragraph(run(value, { size: 19, color: "536873", bold: true }), { after: 0, line: 260 }), options: { fill: "F3F7F8" } });
const value = (placeholder, options = {}) => ({ xml: paragraph(run(placeholder, options), { after: 0, line: 300 }), options: { fill: "FFFFFF" } });

const content = [
  paragraph(run("HPO  |  HỆ THỐNG SÁT HẠCH", { size: 19, color: "0D8279", bold: true }), { align: "center", after: 180 }),
  paragraph(run("PHIẾU KẾT QUẢ", { size: 34, color: "163B4A", bold: true }), { align: "center", after: 20, line: 420 }),
  paragraph(run("THI LÝ THUYẾT", { size: 27, color: "0D8279", bold: true }), { align: "center", after: 90, line: 360 }),
  paragraph(run("Kết quả được ghi nhận từ hệ thống sát hạch", { size: 19, color: "71818D" }), { align: "center", after: 300 }),
  paragraph(run("THÔNG TIN THÍ SINH", { size: 21, color: "163B4A", bold: true }), { before: 100, after: 120 }),
  table([
    [label("Họ và tên"), value("{{theory_full_name}}", { size: 25, bold: true })],
    [label("CCCD / Số định danh"), value("{{theory_identity_card}}")],
    [label("Kỳ thi / Khóa thi"), value("{{theory_course}}")],
    [label("Ngày thi"), value("{{theory_exam_date}}")],
  ], [3000, 6300]),
  paragraph(run("THÔNG TIN BÀI THI", { size: 21, color: "163B4A", bold: true }), { before: 140, after: 120 }),
  table([
    [label("Bắt đầu"), value("{{theory_start_time}}"), label("Kết thúc"), value("{{theory_end_time}}")],
  ], [1700, 2950, 1700, 2950]),
  paragraph(run("KẾT QUẢ", { size: 21, color: "163B4A", bold: true }), { before: 180, after: 120 }),
  table([
    [
      { xml: paragraph(run("ĐIỂM LÝ THUYẾT", { size: 20, color: "FFFFFF", bold: true }), { align: "center", after: 80 }), options: { fill: "0D8279", margins: 180 } },
      { xml: paragraph(run("{{theory_score}}", { size: 34, color: "0D8279", bold: true }), { align: "center", after: 70, line: 440 }), options: { fill: "F0F8F6", margins: 180 } },
    ],
    [
      { xml: paragraph(run("KẾT QUẢ THI", { size: 20, color: "FFFFFF", bold: true }), { align: "center", after: 70 }), options: { fill: "163B4A", margins: 150 } },
      { xml: paragraph(run("[{{theory_passed_check}}]  ĐẠT", { size: 25, color: "08734E", bold: true }), { align: "center", after: 70 }), options: { fill: "EFF9F3", margins: 150 } },
    ],
  ], [3000, 6300], { borders: "C7DEDA" }),
  paragraph(run("XÁC NHẬN", { size: 21, color: "163B4A", bold: true }), { before: 280, after: 180 }),
  table([
    [
      { xml: paragraph(run("THÍ SINH", { size: 20, color: "536873", bold: true }), { align: "center", after: 80 }), options: { fill: "FFFFFF", vertical: "top", margins: 150 } },
      { xml: paragraph(run("CÁN BỘ SÁT HẠCH", { size: 20, color: "536873", bold: true }), { align: "center", after: 80 }), options: { fill: "FFFFFF", vertical: "top", margins: 150 } },
    ],
    [
      { xml: paragraph(run("(Ký và ghi rõ họ tên", { size: 17, color: "87959C" }) + run(")", { size: 17, color: "87959C" }), { align: "center", after: 1000, line: 280 }), options: { fill: "FFFFFF", vertical: "top", margins: 150 } },
      { xml: paragraph(run("(Ký và ghi rõ họ tên", { size: 17, color: "87959C" }) + run(")", { size: 17, color: "87959C" }), { align: "center", after: 1000, line: 280 }), options: { fill: "FFFFFF", vertical: "top", margins: 150 } },
    ],
  ], [4650, 4650], { borders: "FFFFFF", spaceAfter: 0 }),
  paragraph(run("Biểu mẫu được điền tự động từ dữ liệu kết quả thi.", { size: 16, color: "9AA7AE" }), { align: "center", before: 240, after: 0 }),
].join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;

const typesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", typesXml);
zip.file("_rels/.rels", rootRelationships);
zip.file("word/document.xml", documentXml);
zip.file("word/styles.xml", stylesXml);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`Created ${outputPath}`);
