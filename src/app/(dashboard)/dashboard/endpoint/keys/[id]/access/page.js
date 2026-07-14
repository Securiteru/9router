import ApiKeyAccessPageClient from "./ApiKeyAccessPageClient";

export default async function ApiKeyAccessPage({ params }) {
  const { id } = await params;
  return <ApiKeyAccessPageClient apiKeyId={id} />;
}
