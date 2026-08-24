"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import { KNOWN_COLORS } from "@/lib/types";
import type { Category, ProductStatus } from "@/lib/types";

interface DraftVariant {
  color: string;
  sku: string;
  stock: number;
}

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [store, setStore] = useState("");
  const [status, setStatus] = useState<ProductStatus>("Normal");
  const [variants, setVariants] = useState<DraftVariant[]>([
    { color: KNOWN_COLORS[0].name, sku: "", stock: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.categories.list().then(setCategories);
  }, []);

  function updateVariant(index: number, patch: Partial<DraftVariant>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((prev) => [...prev, { color: KNOWN_COLORS[0].name, sku: "", stock: 0 }]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (variants.length === 0) {
      toast.error("Agregá al menos una variante");
      return;
    }
    setSaving(true);
    try {
      const product = await api.products.create({
        categoryId,
        name,
        description,
        price: Number(price),
        store,
        status,
        variants,
      });
      toast.success("Producto creado");
      router.push(`/products/${product.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error creando producto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/products")}>
        ← Volver
      </Button>
      <h1 className="text-2xl font-semibold">Nuevo producto</h1>

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Categoría</Label>
          <Select value={categoryId} onValueChange={setCategoryId} required>
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="Elegir categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
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

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="price">Precio</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="store">Tienda</Label>
            <Input id="store" required value={store} onChange={(e) => setStore(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Estado</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProductStatus)}>
            <SelectTrigger id="status" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Normal", "New", "Hot", "Popular"] as ProductStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>Variantes</Label>
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>
              Agregar variante
            </Button>
          </div>
          {variants.map((variant, index) => (
            <div key={index} className="flex items-end gap-2 rounded-md border p-3">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`variant-color-${index}`} className="text-xs">
                  Color
                </Label>
                <Select
                  value={variant.color}
                  onValueChange={(v) => updateVariant(index, { color: v })}
                >
                  <SelectTrigger id={`variant-color-${index}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWN_COLORS.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`variant-sku-${index}`} className="text-xs">
                  SKU
                </Label>
                <Input
                  id={`variant-sku-${index}`}
                  required
                  value={variant.sku}
                  onChange={(e) => updateVariant(index, { sku: e.target.value })}
                />
              </div>
              <div className="flex w-24 flex-col gap-1">
                <Label htmlFor={`variant-stock-${index}`} className="text-xs">
                  Stock
                </Label>
                <Input
                  id={`variant-stock-${index}`}
                  type="number"
                  min="0"
                  value={variant.stock}
                  onChange={(e) => updateVariant(index, { stock: Number(e.target.value) })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar variante ${index + 1}`}
                onClick={() => removeVariant(index)}
                disabled={variants.length === 1}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="submit" disabled={saving} className="w-fit">
          {saving ? "Creando…" : "Crear producto"}
        </Button>
      </form>
    </div>
  );
}
