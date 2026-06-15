import { pdfjs } from "react-pdf";
// react-pdf v10 ships pdfjs-dist@5.x. We pin the top-level pdfjs-dist to that SAME
// version, so this worker matches react-pdf's pdfjs *API* version — a mismatch is the
// #1 cause of "The API version X does not match the Worker version Y".
// `?url` is the reliable Vite way to get the bundled worker's served URL.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
