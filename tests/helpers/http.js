// Test helpers shared by the HTTP API tests.

// url: the full request URL. Returns { status, body } with body parsed as JSON when it can be.
export async function callApi(url, method, { body, token, headers: extra = {} } = {}) {
  const headers = { ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// Retries `check` (which throws until it holds) until it passes or the time runs out.
export async function eventually(check, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    try {
      return await check();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
}
