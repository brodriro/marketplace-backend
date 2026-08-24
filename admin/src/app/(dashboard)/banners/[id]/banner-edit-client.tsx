"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api-client";
import type { Banner } from "@/lib/types";
import { BannerForm } from "../banner-form";

export function BannerEditClient({ id }: { id: string }) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    api.banners
      .get(id)
      .then(setBanner)
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : "Error cargando banner");
      });
  }, [id]);

  if (!banner) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/banners")}>
        ← Volver
      </Button>
      <h1 className="text-2xl font-semibold">{banner.store}</h1>
      <BannerForm banner={banner} />
    </div>
  );
}
