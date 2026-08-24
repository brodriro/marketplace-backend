import { UserEditClient } from "./user-edit-client";

export default async function UserEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserEditClient id={id} />;
}
