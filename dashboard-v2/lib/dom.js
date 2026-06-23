// Tiny dependency-free DOM helpers. No framework.
// el("div", { class, style:{}, onClick, html, ...attrs }, ...children)

const PROP_KEYS = new Set(["value", "checked", "disabled", "placeholder", "href", "src", "type", "id"]);

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "html") node.innerHTML = v;
      else if (k === "ref" && typeof v === "function") v(node);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROP_KEYS.has(k)) node[k] = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

// Replace the contents of a node with new children.
export function mount(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

// Fragment helper for returning multiple nodes from a component.
export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}
