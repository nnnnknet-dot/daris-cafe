export default function DarisCafe() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: "48px", marginBottom: "20px" }}>
        Daris Cafe ☕
      </h1>

      <p style={{ fontSize: "20px", color: "#555" }}>
        Welcome to our cafe
      </p>
    </div>
  );
}