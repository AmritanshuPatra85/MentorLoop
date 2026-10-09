"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          textAlign: "center",
        }}
      >
        <div>
          <h1>Something went seriously wrong</h1>
          <p>The app hit an unexpected error. Please try again.</p>
          <button onClick={reset} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}