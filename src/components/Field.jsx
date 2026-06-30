export function Field({ label, required = false, wide = false, children }) {
  return (
    <label className={`field ${wide ? "is-wide" : ""}`}>
      <span>
        {label}
        {required ? <b>*</b> : null}
      </span>
      {children}
    </label>
  );
}
