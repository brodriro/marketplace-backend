import { ProductEditClient } from "./product-edit-client";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductEditClient id={id} />;
}
