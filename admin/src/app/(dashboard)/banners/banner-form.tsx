"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUrlField } from "@/components/image-url-field";
import { ApiError, api } from "@/lib/api-client";
import type { Banner } from "@/lib/types";

export function BannerForm({ banner }: { banner?: Banner }) {
  const router = useRouter();
  const [store, setStore] = useState(banner?.store ?? "");
  const [description, setDescription] = useState(banner?.description ?? "");
  const [image, setImage] = useState(banner?.image ?? "");
  const [sortOrder, setSortOrder] = useState(banner?.sortOrder ?? 0);
  const [active, setActive] = useState(banner?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (banner) {
        await api.banners.update(banner.id, { store, description, image, sortOrder, active });
        toast.success("Banner actualizado");
      } else {
        await api.banners.create({ store, description, image, sortOrder, active });
        toast.success("Banner creado");
      }
      router.push("/banners");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error guardando banner");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!banner) return;
    try {
      await api.banners.remove(banner.id);
      toast.success("Banner eliminado");
      router.push("/banners");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error eliminando");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="store">Tienda</Label>
        <Input id="store" required value={store} onChange={(e) => setStore(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ImageUrlField id="image" label="Imagen" value={image} onChange={setImage} required />
      <div className="flex flex-col gap-2">
        <Label htmlFor="sortOrder">Orden</Label>
        <Input
          id="sortOrder"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="active">Activo</Label>
        <Switch id="active" checked={active} onCheckedChange={setActive} />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : banner ? "Guardar cambios" : "Crear banner"}
        </Button>
        {banner && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este banner?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se oculta y deja de mostrarse. No se borra de la base de datos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}
