"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Category, Product, ProductStatus } from "@/lib/types";

export function ProductEditClient({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [store, setStore] = useState("");
  const [status, setStatus] = useState<ProductStatus>("Normal");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  const [newColor, setNewColor] = useState(KNOWN_COLORS[0].name);
  const [newSku, setNewSku] = useState("");
  const [newStock, setNewStock] = useState(0);

  async function load() {
    try {
      const [p, cats] = await Promise.all([api.products.get(id), api.categories.list()]);
      setProduct(p);
      setName(p.name);
      setDescription(p.description);
      setPrice(p.price);
      setStore(p.store);
      setStatus(p.status);
      setCategoryId(p.categoryId);
      setCategories(cats);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error cargando producto");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, no un loop de render
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.products.update(id, {
        categoryId,
        name,
        description,
        price: Number(price),
        store,
        status,
      });
      toast.success("Producto actualizado");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    try {
      await api.products.remove(id);
      toast.success("Producto eliminado");
      router.push("/products");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error eliminando");
    }
  }

  async function handleAddVariant() {
    if (!newSku) {
      toast.error("Ingresá un SKU");
      return;
    }
    try {
      await api.products.addVariant(id, { color: newColor, sku: newSku, stock: newStock });
      toast.success("Variante agregada");
      setNewSku("");
      setNewStock(0);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error agregando variante");
    }
  }

  async function handleStockChange(variantId: string, stock: number) {
    try {
      await api.products.updateVariant(id, variantId, { stock });
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error actualizando stock");
    }
  }

  async function handleRemoveVariant(variantId: string) {
    try {
      await api.products.removeVariant(id, variantId);
      toast.success("Variante eliminada");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error eliminando variante");
    }
  }

  if (!product) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/products")}>
        ← Volver
      </Button>
      <h1 className="text-2xl font-semibold">{product.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
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
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
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
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="store">Tienda</Label>
              <Input id="store" value={store} onChange={(e) => setStore(e.target.value)} />
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
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving} className="w-fit">
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                  Eliminar producto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar {product.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    El producto se oculta del catálogo y deja de ser visible para todos. No se
                    borra de la base de datos (los pedidos que ya lo incluyen no se ven afectados).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteProduct}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variantes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {product.variants.map((variant) => (
            <div key={variant.id} className="flex items-center gap-3 rounded-md border p-3">
              <span className="w-24 text-sm font-medium">{variant.color}</span>
              <span className="flex-1 text-sm text-muted-foreground">{variant.sku}</span>
              <Input
                type="number"
                min="0"
                className="w-24"
                aria-label={`Stock de ${variant.color} / ${variant.sku}`}
                defaultValue={variant.stock}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== variant.stock) handleStockChange(variant.id, value);
                }}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar variante ${variant.color} / ${variant.sku}`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      ¿Eliminar la variante {variant.color} / {variant.sku}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Se oculta del catálogo y deja de poder venderse. No se borra de la base de
                      datos (los pedidos que ya la incluyen no se ven afectados).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRemoveVariant(variant.id)}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}

          <div className="flex items-end gap-2 rounded-md border border-dashed p-3">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="new-variant-color" className="text-xs">
                Color
              </Label>
              <Select value={newColor} onValueChange={setNewColor}>
                <SelectTrigger id="new-variant-color" className="w-full">
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
              <Label htmlFor="new-variant-sku" className="text-xs">
                SKU
              </Label>
              <Input
                id="new-variant-sku"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
              />
            </div>
            <div className="flex w-24 flex-col gap-1">
              <Label htmlFor="new-variant-stock" className="text-xs">
                Stock
              </Label>
              <Input
                id="new-variant-stock"
                type="number"
                min="0"
                value={newStock}
                onChange={(e) => setNewStock(Number(e.target.value))}
              />
            </div>
            <Button type="button" variant="outline" onClick={handleAddVariant}>
              Agregar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
