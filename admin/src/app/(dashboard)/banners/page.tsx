"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api } from "@/lib/api-client";
import type { Banner } from "@/lib/types";

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null);

  async function load() {
    try {
      const res = await api.banners.list(1, 100);
      setBanners(res.data.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error cargando banners");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, no un loop de render
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Banners</h1>
        <Button asChild>
          <Link href="/banners/new">Nuevo banner</Link>
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Imagen</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners?.map((banner) => (
              <TableRow key={banner.id}>
                <TableCell>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen externa arbitraria */}
                  <img
                    src={banner.image}
                    alt={banner.store}
                    width={64}
                    height={40}
                    className="h-10 w-16 rounded object-cover"
                  />
                </TableCell>
                <TableCell className="font-medium">{banner.store}</TableCell>
                <TableCell className="max-w-xs truncate">{banner.description}</TableCell>
                <TableCell>{banner.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant={banner.active ? "secondary" : "outline"}>
                    {banner.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/banners/${banner.id}`}>Editar</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {banners?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay banners.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
