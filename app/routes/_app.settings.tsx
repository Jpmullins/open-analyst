import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { SettingsPanel } from "~/components/SettingsPanel";

export { loader } from "./_app.settings.loader.server";

export default function SettingsRoute() {
  const data = useLoaderData<typeof import("./_app.settings.loader.server").loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as
    | "api"
    | "sandbox"
    | "credentials"
    | "connectors"
    | "skills"
    | "logs") || "api";

  return (
    <SettingsPanel
      isOpen={true}
      onClose={() => navigate(-1)}
      activeTab={activeTab}
      onTabChange={(tab) => setSearchParams({ tab }, { replace: true })}
      initialData={data}
    />
  );
}
