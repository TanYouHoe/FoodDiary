// Logic: the build id that ties a running page to the deployed server. The
// build writes it into the app script and dist/build-id.txt; the server sends
// it on API answers; the browser compares the two.

export const BUILD_HEADER = 'X-App-Build';
export const BUILD_ID_FILE = 'build-id.txt';

const BUILD_ID = /^[\w.-]{1,64}$/;

// value: text from a file, a header or the build. Returns the trimmed id, or
// null when it is not a short id (safe to send as a header).
export function normalizeBuildId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return BUILD_ID.test(id) ? id : null;
}

// clientBuild: the build of the running page. serverBuild: the X-App-Build
// header, or null. A different non-empty server build means an update is available.
export function isNewBuild(clientBuild, serverBuild) {
  const client = normalizeBuildId(clientBuild);
  const server = normalizeBuildId(serverBuild);
  return client !== null && server !== null && client !== server;
}
