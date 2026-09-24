import { extractText, getDocumentProxy } from "unpdf";

/** Plain text from a PDF, pages joined by newlines. Returns null if the PDF has no text layer or can't be read. */
export async function pdfToText(data: Buffer): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: false });
    const joined = text.join("\n").trim();
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}
