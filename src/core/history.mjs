export function appendHistory(item, entry) {
  const history = Array.isArray(item.history) ? [...item.history] : [];
  history.push(entry);
  item.history = history;
  return item;
}
