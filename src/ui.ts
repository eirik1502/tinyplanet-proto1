// Small DOM helpers for the dev panel. Every control hands keyboard focus back to the game once
// used, so the arrows and Space don't keep nudging it.

/** An element with these properties (className, textContent, value…) and children. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

export function button(text: string, onClick: () => void, cls = "", title = "") {
  const b = el("button", { textContent: text, className: cls, title });
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
    b.blur();
  });
  return b;
}

/** A number input; `onChange` gets the value clamped to [min, max], or null when left empty. */
export function numberInput(value: number | null, min: number, max: number, step: number, onChange: (v: number | null) => void, placeholder = "") {
  const input = el("input", { type: "number", min: String(min), max: String(max), step: String(step), placeholder });
  input.value = value === null ? "" : String(value);
  input.addEventListener("input", () => {
    if (input.value.trim() === "") return onChange(null);
    const v = Number(input.value);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  });
  input.addEventListener("change", () => input.blur());
  return input;
}

export function checkbox(text: string, checked: boolean, onChange: (v: boolean) => void, title = "") {
  const input = el("input", { type: "checkbox", checked });
  input.addEventListener("change", () => {
    onChange(input.checked);
    input.blur();
  });
  return el("label", { className: "check", title }, input, el("span", { textContent: text }));
}

export function select(options: [value: string, label: string][], value: string, onChange: (v: string) => void) {
  const s = el("select");
  for (const [v, label] of options) s.append(el("option", { value: v, textContent: label }));
  s.value = value;
  s.addEventListener("change", () => {
    onChange(s.value);
    s.blur();
  });
  return s;
}

/** A labelled slider with its value shown. */
export function slider(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) {
  const out = el("output", { textContent: fmtNum(value, step) });
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) });
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    out.textContent = fmtNum(v, step);
    onChange(v);
  });
  input.addEventListener("change", () => input.blur());
  input.addEventListener("pointerup", () => input.blur());
  return el("label", { className: "slider" }, el("span", { textContent: label }), out, input);
}

export const fmtNum = (v: number, step: number) => (step < 1 ? v.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v)));

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts without the async clipboard API.
    const ta = el("textarea", { value: text });
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** A button that copies `text()` and says whether it worked. */
export function copyButton(label: string, text: () => string, title = "") {
  const b = button(label, async () => {
    const ok = await copyText(text());
    b.textContent = ok ? "Copied!" : "Copy failed";
    setTimeout(() => (b.textContent = label), 1400);
  }, "", title);
  return b;
}
