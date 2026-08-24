"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BannerForm } from "../banner-form";

export default function NewBannerPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/banners")}>
        ← Volver
      </Button>
      <h1 className="text-2xl font-semibold">Nuevo banner</h1>
      <BannerForm />
    </div>
  );
}
