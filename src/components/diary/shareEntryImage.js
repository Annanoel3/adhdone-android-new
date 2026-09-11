import html2canvas from "html2canvas";

// Renders a diary entry element to a PNG and hands it to the phone so the user
// can save it to their photos. Nothing is uploaded anywhere — the image is
// created on the device and never leaves it unless the user picks a target.
export async function shareEntryImage(element, fileName) {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;

  const file = new File([blob], `${fileName}.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}