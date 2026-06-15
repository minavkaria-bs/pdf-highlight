import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// NOTE: We intentionally do NOT wrap <App/> in <StrictMode>.
// react-pdf renders pages onto a <canvas> imperatively. StrictMode's dev-only
// mount→unmount→remount double-invoke cancels the in-flight render and clears the
// canvas mid-paint, which leaves image-heavy pages blank (the cancel wins the race).
// StrictMode is a no-op in production builds, so removing it keeps dev == prod here.
createRoot(document.getElementById("root")!).render(<App />);
