"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api-client";
import type { Category } from "@/lib/types";
import { CategoryForm } from "../category-form";

export function CategoryEditClient({ id }: { id: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<Category | null>(null);

  useEffect(() => {
    api.categories
      .get(id)
      .then(setCategory)
      .catch((error) => {
        toast.error(
          error instanceof ApiError ? error.message : "Error cargando categoría",
        );
      });
  }, [id]);

  if (!category) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/categories")}
      >
        ← Volver
      </Button>
      <h1 className="text-2xl font-semibold">{category.name}</h1>
      <CategoryForm category={category} />
    </div>
  );
}
