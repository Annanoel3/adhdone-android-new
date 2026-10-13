import { jsPDF } from "jspdf";

// Builds a PDF of a recording's notes on the phone and hands it to the share
// sheet (save to Files, Drive, email…); falls back to a plain download.
export async function downloadNotesPdf(record, subtitle) {
  const n = record.notes || {};
  const title = record.title || n.title || "Recording";
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 50;
  const width = doc.internal.pageSize.getWidth() - left * 2;
  const bottom = doc.internal.pageSize.getHeight() - 50;
  let y = 60;

  const write = (text, size = 11, bold = false, gap = 4) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(String(text || ""), width)) {
      if (y > bottom) { doc.addPage(); y = 60; }
      doc.text(line, left, y);
      y += size * 1.35;
    }
    y += gap;
  };
  const section = (heading, items) => {
    if (!items.length) return;
    y += 8;
    write(heading, 14, true, 2);
    items.forEach((t) => write(`• ${t}`));
  };

  write(title, 20, true, 2);
  if (subtitle) write(subtitle, 10, false, 6);

  section("The gist", n.gist || []);
  section("Things to bring up", (n.asked || []).map((a) => `${a.question}: ${a.answered ? a.answer : "No clear answer in the recording"}`));
  const isMine = (t) => (t.who || "you").toLowerCase() === "you";
  section("Your to-dos", (n.todos || []).filter(isMine).map((t) => t.text));
  section("What others will do", (n.todos || []).filter((t) => !isMine(t)).map((t) => `${t.who}: ${t.text}`));
  section("Details to keep", (n.details || []).map((d) => (d.label ? `${d.label}: ${d.value}` : d.value)));
  (n.sections || []).forEach((s) => section(s.heading, s.points || []));
  section("Decided", (n.decisions || []).map((d) => d.text));
  section("Still open", (n.questions || []).map((d) => d.text));

  const fileName = `${title.replace(/[^\w\- ]+/g, "").trim() || "Notes"}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}