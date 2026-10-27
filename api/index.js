module.exports = async function vercelHandler(req, res) {
  const requestUrl = new URL(req.url || "/", "http://vercel.local");
  const apiPath = requestUrl.searchParams.get("__vercel_rewrite_path");

  if (apiPath !== null) {
    requestUrl.searchParams.delete("__vercel_rewrite_path");
    req.url = `/api/${apiPath}${requestUrl.search}`;
  }

  const { default: handler } = await import(
    "../artifacts/api-server/dist/vercel.mjs"
  );
  return handler(req, res);
};
