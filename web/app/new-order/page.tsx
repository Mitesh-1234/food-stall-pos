"use client";

import { useEffect } from "react";

export default function NewOrderPage() {
  useEffect(() => {
    window.location.replace("/orders");
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "system-ui, sans-serif",
        color: "#64748b",
      }}
    >
      Opening Orders...
    </main>
  );
}