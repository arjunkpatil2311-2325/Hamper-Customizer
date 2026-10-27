module.exports = async function vercelHandler(req, res) {
  const { default: handler } = await import(
    "../artifacts/api-server/dist/vercel.mjs"
  );
  return handler(req, res);
};
