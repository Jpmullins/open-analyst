import { redirect } from "react-router";

export async function loader({
  params,
}: {
  params: { projectId: string; taskId: string };
}) {
  // Tasks table has been dropped; redirect to the project home page.
  throw redirect(`/projects/${params.projectId}`);
}
