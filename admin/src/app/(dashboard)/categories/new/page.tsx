"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CategoryForm } from "../category-form";

export default function NewCategoryPage() {
  const router = useRouter();
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
      <h1 className="text-2xl font-semibold">Nueva categoría</h1>
      <CategoryForm />
    </div>
  );
}
