import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#f85149", background: "#0a0e14", minHeight: "100vh", fontFamily: "monospace" }}>
          <h2>应用错误 / App Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{this.state.error.message || String(this.state.error)}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#6e7681", marginTop: 16 }}>{this.state.error.stack || ""}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 20, padding: "8px 16px", cursor: "pointer" }}>重试 / Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
const root = rootElement.__foamCrmRoot || createRoot(rootElement);
rootElement.__foamCrmRoot = root;

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
