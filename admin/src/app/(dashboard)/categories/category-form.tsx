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
import { ImageUrlField } from "@/components/image-url-field";
import { ApiError, api } from "@/lib/api-client";
import type { Category } from "@/lib/types";

export function CategoryForm({ category }: { category?: Category }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [subtitle, setSubtitle] = useState(category?.subtitle ?? "");
  const [image, setImage] = useState(category?.image ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
        ...(image.trim() ? { image: image.trim() } : {}),
      };
      if (category) {
        await api.categories.update(category.id, payload);
        toast.success("Categoría actualizada");
      } else {
        await api.categories.create(payload);
        toast.success("Categoría creada");
      }
      router.push("/categories");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Error guardando categoría",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!category) return;
    try {
      await api.categories.remove(category.id);
      toast.success("Categoría eliminada");
      router.push("/categories");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error eliminando");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="subtitle">Subtítulo</Label>
        <Input
          id="subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="p. ej. 215 Products"
        />
      </div>
      <ImageUrlField id="image" label="Imagen (URL)" value={image} onChange={setImage} />

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
        </Button>
        {category && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta categoría?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borra de la base de datos de forma permanente. Solo se permite si no
                  tiene productos asociados.
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
