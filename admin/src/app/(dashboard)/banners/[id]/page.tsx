import { BannerEditClient } from "./banner-edit-client";

export default async function BannerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BannerEditClient id={id} />;
}
