import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
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
    assert.ok(documentXml.includes("[X]  ĐẠT"));
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
