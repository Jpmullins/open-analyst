export async function loader() {
  return Response.json({ ok: true, service: "open-analyst-headless" });
}
