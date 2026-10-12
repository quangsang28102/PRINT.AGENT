import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import sharp from "sharp";
import { renderWordTemplate } from "../wordPrintRenderer.js";

test("renders the local simulation Word form without unresolved tags", async () => {
  const templateData = {
    simulation_full_name: "BẢN IN THỬ",
    simulation_birthday: "01/01/2000",
    simulation_identity_card: "PRINT-TEST",
    simulation_license_type: "B",
    simulation_no: "TEST-001",
    simulation_course: "KIỂM TRA MẪU BIÊN BẢN MÔ PHỎNG",
    simulation_exam_date: "01/01/2026",
    simulation_start_time: "15:00:00 01/01/2026",
    simulation_end_time: "15:10:00 01/01/2026",
    simulation_attempt: "1",
    simulation_score: "8/10",
    simulation_gained_score: 8,
    simulation_passed_check: "X",
    simulation_failed_check: "",
    simulation_image: { width: 113, height: 151 },
    simulation_question_1: "1",
    simulation_question_2: "1",
    simulation_question_3: "1",
    simulation_question_4: "1",
    simulation_question_5: "1",
    simulation_question_6: "1",
    simulation_question_7: "1",
    simulation_question_8: "1",
    simulation_question_9: "0",
    simulation_question_10: "0",
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-print-test-"));
  const outputPath = path.join(directory, "result.docx");

  try {
    await renderWordTemplate("simulation", templateData, outputPath);
    const documentXml = new PizZip(await fs.readFile(outputPath)).file("word/document.xml").asText();
    assert.doesNotMatch(documentXml, /\{\{[^{}]+\}\}/);
    assert.doesNotMatch(documentXml, />undefined</);
    assert.ok(documentXml.includes("PRINT-TEST"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renders the simulation result photo without a border around the photo cell or image", async () => {
  const image = await sharp({
    create: { width: 120, height: 160, channels: 3, background: "#e53935" },
  }).jpeg().toBuffer();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-simulation-photo-test-"));
  const outputPath = path.join(directory, "simulation-photo.docx");

  try {
    await renderWordTemplate("simulation", {
      simulation_image: { value: image.toString("base64"), width: 113, height: 151 },
    }, outputPath);

    const zip = new PizZip(await fs.readFile(outputPath));
    const documentXml = zip.file("word/document.xml").asText();
    const drawingPosition = documentXml.indexOf("<w:drawing>");
    const imageCellStart = documentXml.lastIndexOf("<w:tc>", drawingPosition);
    const imageCellEnd = documentXml.indexOf("</w:tc>", drawingPosition) + "</w:tc>".length;
    const imageCell = documentXml.slice(imageCellStart, imageCellEnd);
    const drawing = documentXml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/)?.[0] || "";

    assert.ok(zip.file("word/media/image_generated_1.png"), "the result photo is embedded in the DOCX");
    assert.match(imageCell, /<w:tcBorders>(?:(?!<\/w:tcBorders>)[\s\S])*<w:top w:val="nil"\/>[\s\S]*<\/w:tcBorders>/);
    assert.match(drawing, /<a:ln[^>]*>[\s\S]*?<a:noFill\/>[\s\S]*?<\/a:ln>/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("all bundled Word forms use A4 portrait and printer Tray 1", async () => {
  const templatePaths = [
    path.join(import.meta.dirname, "..", "templates", "theory", "theory-b-30-result.docx"),
    path.join(import.meta.dirname, "..", "templates", "theory", "theory-c1-35-result.docx"),
    path.join(import.meta.dirname, "..", "templates", "simulation", "simulation-result.docx"),
  ];

  for (const templatePath of templatePaths) {
    const zip = new PizZip(await fs.readFile(templatePath));
    const documentXml = zip.file("word/document.xml").asText();
    const sections = [...documentXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].map((match) => match[0]);

    assert.ok(sections.length > 0, `${path.basename(templatePath)} contains a section`);
    for (const section of sections) {
      const pageSize = section.match(/<w:pgSz\b[^>]*\/?>/)?.[0] || "";
      assert.match(pageSize, /\bw:w="11906"/);
      assert.match(pageSize, /\bw:h="16838"/);
      assert.doesNotMatch(pageSize, /\bw:orient="landscape"/);
      assert.match(section, /<w:paperSrc w:first="1" w:other="1"\/>/);
    }
  }
});

test("renders the theory form from the server print payload and localizes timestamps", async () => {
  const templateData = {
    theory_full_name: "NGUYỄN VĂN A",
    theory_identity_card: "012345678901",
    theory_course: "SÁT HẠCH LÁI XE HẠNG B",
    theory_exam_date: "2026-10-05T17:00:00.000Z",
    theory_start_time: "2026-10-06T03:15:00.000Z",
    theory_end_time: "2026-10-06T03:45:00.000Z",
    theory_score: 28,
    theory_passed_check: "X",
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-theory-print-test-"));
  const outputPath = path.join(directory, "theory-result.docx");

  try {
    await renderWordTemplate("theory", templateData, outputPath);
    const zip = new PizZip(await fs.readFile(outputPath));
    const documentXml = zip.file("word/document.xml").asText();
    assert.doesNotMatch(documentXml, /\{\{[^{}]+\}\}/);
    assert.ok(documentXml.includes("NGUYỄN VĂN A"));
    assert.ok(documentXml.includes("012345678901"));
    assert.ok(documentXml.includes("06/10/2026"));
    assert.ok(documentXml.includes("06/10/2026 10:15"));
    assert.ok(documentXml.includes("06/10/2026 10:45"));
    assert.ok(documentXml.includes("28"));
    assert.ok(documentXml.includes(">X</w:t>"));
    assert.ok(documentXml.includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'));
    assert.ok(documentXml.includes('xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'));
    assert.ok(documentXml.includes('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'));
    assert.ok(documentXml.includes('xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'));
    assert.ok(zip.file("word/media/image_generated_1.png"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("prefers a custom local template over the bundled template", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-custom-template-test-"));
  const customTemplateDirectory = path.join(directory, "custom-templates");
  const source = new PizZip(await fs.readFile(path.join(import.meta.dirname, "..", "templates", "simulation", "simulation-result.docx")));
  const documentFile = source.file("word/document.xml");
  const originalXml = documentFile.asText();
  assert.ok(originalXml.includes("{{simulation_full_name}}"), "fixture has the expected name placeholder");
  source.file("word/document.xml", originalXml.replace("{{simulation_full_name}}", "MẪU RIÊNG - {{simulation_full_name}}"));
  await fs.mkdir(customTemplateDirectory, { recursive: true });
  await fs.writeFile(path.join(customTemplateDirectory, "simulation.docx"), source.generate({ type: "nodebuffer" }));
  const outputPath = path.join(directory, "result.docx");

  try {
    await renderWordTemplate("simulation", {
      simulation_full_name: "BÀI KIỂM TRA",
      simulation_birthday: "01/01/2000",
      simulation_identity_card: "PRINT-TEST",
      simulation_license_type: "B",
      simulation_no: "TEST-001",
      simulation_course: "KIỂM TRA MẪU RIÊNG",
      simulation_exam_date: "01/01/2026",
      simulation_start_time: "15:00:00 01/01/2026",
      simulation_end_time: "15:10:00 01/01/2026",
      simulation_attempt: "1",
      simulation_score: "8/10",
      simulation_gained_score: 8,
      simulation_passed_check: "X",
      simulation_failed_check: "",
      simulation_image: { width: 113, height: 151 },
      simulation_question_1: "1",
      simulation_question_2: "1",
      simulation_question_3: "1",
      simulation_question_4: "1",
      simulation_question_5: "1",
      simulation_question_6: "1",
      simulation_question_7: "1",
      simulation_question_8: "1",
      simulation_question_9: "0",
      simulation_question_10: "0",
    }, outputPath, { customTemplateDirectory });
    const renderedXml = new PizZip(await fs.readFile(outputPath)).file("word/document.xml").asText();
    assert.ok(renderedXml.includes("MẪU RIÊNG - BÀI KIỂM TRA"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("selects theory templates by result question count, regardless of license metadata", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-theory-variants-test-"));
  const customTemplateDirectory = path.join(directory, "custom-templates");
  const defaultTemplate = path.join(import.meta.dirname, "..", "templates", "theory", "theory-b-30-result.docx");
  await fs.mkdir(customTemplateDirectory, { recursive: true });

  for (const [fileName, marker] of [["theory-b-30.docx", "FORM_B_30"], ["theory-c1-35.docx", "FORM_C1_35"]]) {
    const zip = new PizZip(await fs.readFile(defaultTemplate));
    const xml = zip.file("word/document.xml").asText();
    const heading = "BIÊN BẢN SÁT HẠCH LÝ THUYẾT";
    assert.ok(xml.includes(heading), "fixture has its expected heading");
    zip.file("word/document.xml", xml.replace(heading, `${marker} ${heading}`));
    await fs.writeFile(path.join(customTemplateDirectory, fileName), zip.generate({ type: "nodebuffer" }));
  }

  try {
    const cases = [
      { licenseType: "C1", questionCount: 30, serverVariant: "theory-c1-35", fileMarker: "FORM_B_30" },
      { licenseType: "B", questionCount: 31, serverVariant: "theory-b-30", fileMarker: "FORM_C1_35" },
      { licenseType: "invalid-import-value", questionCount: 35, fileMarker: "FORM_C1_35" },
    ];

    for (const [index, item] of cases.entries()) {
      const questionData = Object.fromEntries(Array.from({ length: item.questionCount }, (_, questionIndex) => [
        `theory_q${String(questionIndex + 1).padStart(2, "0")}_a1`, "",
      ]));
      const outputPath = path.join(directory, `result-${index}.docx`);
      await renderWordTemplate("theory", {
        theory_full_name: "THÍ SINH KIỂM THỬ",
        theory_license_type: item.licenseType,
        ...questionData,
      }, outputPath, { customTemplateDirectory, templateVariant: item.serverVariant });
      const xml = new PizZip(await fs.readFile(outputPath)).file("word/document.xml").asText();
      assert.ok(xml.includes(item.fileMarker));
    }

    const bundledC1Path = path.join(directory, "bundled-c1.docx");
    const c1QuestionData = Object.fromEntries(Array.from({ length: 31 }, (_, questionIndex) => [
      `theory_q${String(questionIndex + 1).padStart(2, "0")}_a1`, "",
    ]));
    await renderWordTemplate("theory", {
      theory_license_type: "B",
      ...c1QuestionData,
    }, bundledC1Path, {
      customTemplateDirectory: path.join(directory, "no-templates"),
      templateVariant: "theory-b-30",
    });
    const bundledC1Xml = new PizZip(await fs.readFile(bundledC1Path)).file("word/document.xml").asText();
    assert.ok(bundledC1Xml.includes("35"), "uses the bundled C1 form if no local custom form has been uploaded");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renders the bundled 30-question and 35-question theory templates", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-bundled-theory-templates-test-"));
  const cases = [
    { variant: "theory-b-30", license: "B (Số tự động)", questionCount: 30, split: 15 },
    { variant: "theory-c1-35", license: "C1", questionCount: 35, split: 17 },
  ];

  try {
    for (const [index, item] of cases.entries()) {
      const templateData = {
        theory_full_name: "THÍ SINH KIỂM THỬ",
        theory_date_of_birth: "01/01/2000",
        theory_identity_card: "TEST-ONLY",
        theory_license_type: item.license,
        theory_candidate_number: "SBD-TEST",
        theory_course: "KHÓA TEST",
        theory_exam_date: "2026-10-07T00:00:00.000Z",
        theory_start_time: "2026-10-07T01:00:00.000Z",
        theory_end_time: "2026-10-07T01:30:00.000Z",
        theory_attempt_number: "1",
        theory_score: "30",
        theory_passed_check: "X",
        theory_failed_check: "",
        theory_image: { value: null, width: 113, height: 151 },
      };
      for (let question = 1; question <= item.questionCount; question += 1) {
        for (let answer = 1; answer <= 4; answer += 1) {
          const questionNumber = String(question).padStart(2, "0");
          templateData[`theory_q${questionNumber}_a${answer}`] = question === 1 && answer === 1 ? "X" : "";
        }
      }

      const outputPath = path.join(directory, `theory-${index}.docx`);
      await renderWordTemplate("theory", templateData, outputPath, { templateVariant: item.variant });
      const zip = new PizZip(await fs.readFile(outputPath));
      const xml = zip.file("word/document.xml").asText();
      assert.doesNotMatch(xml, /\{\{[^{}]+\}\}/);
      assert.ok(xml.includes("THÍ SINH KIỂM THỬ"));
      assert.ok(xml.includes("SBD-TEST"));
      assert.ok(xml.includes(">X</w:t>"));
      assert.ok(xml.includes(`>${item.split}</w:t>`));
      assert.ok(xml.includes(`>${item.questionCount}</w:t>`));
      const section = xml.match(/<w:pgSz[^>]+\/>/)?.[0];
      assert.match(section || "", /w:w="11906"/);
      assert.match(section || "", /w:h="16838"/);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("renders the theory image placeholder into the Word document", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-theory-photo-test-"));
  const image = await sharp({
    create: { width: 120, height: 180, channels: 3, background: "#cccccc" },
  }).jpeg().toBuffer();
  const outputPath = path.join(directory, "theory-photo.docx");

  try {
    await renderWordTemplate("theory", {
      theory_license_type: "C1",
      theory_image: { value: image.toString("base64"), width: 113, height: 151 },
    }, outputPath, { templateVariant: "theory-c1-35" });
    const zip = new PizZip(await fs.readFile(outputPath));
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));
    assert.equal(mediaFiles.length, 1);
    assert.ok(zip.file("word/document.xml").asText().includes("35"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects print types that have no supported Word template", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hpo-agent-no-theory-template-test-"));
  try {
    await assert.rejects(
      renderWordTemplate("practice", {}, path.join(directory, "result.docx"), { customTemplateDirectory: path.join(directory, "custom-templates") }),
      /Không hỗ trợ loại form: practice/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
