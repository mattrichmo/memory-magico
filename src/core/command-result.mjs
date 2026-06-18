export function commandResult({ ok = true, format = 'human', title = '', data = null, warnings = [], error = null, meta = null, render = '' } = {}) {
  return { ok, format, title, data, warnings, error, meta, render };
}

export function okResult(data, meta = {}) {
  return commandResult({ ok: true, format: 'json', data, meta });
}

export function errorResult(error, warnings = [], meta = {}) {
  return commandResult({ ok: false, format: 'json', error, warnings, meta });
}

