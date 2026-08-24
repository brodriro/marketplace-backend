"use client";

import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api-client";
import { decodeJwtPayload, getToken } from "@/lib/auth";
import type { Role, SafeUser } from "@/lib/types";

export function UserEditClient({ id }: { id: string }) {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const currentUserId = decodeJwtPayload(getToken() ?? "")?.sub;
  const isSelf = currentUserId === id;

  useEffect(() => {
    api.users
      .get(id)
      .then((u) => {
        setUser(u);
        setName(u.name);
        setEmail(u.email);
      })
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : "Error cargando usuario");
      });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.users.update(id, { name, email });
      setUser(updated);
      toast.success("Usuario actualizado");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(role: Role) {
    try {
      const updated = await api.users.setRole(id, role);
      setUser(updated);
      toast.success(`Rol actualizado a ${role}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error cambiando rol");
    }
  }

  async function handleActiveChange(active: boolean) {
    try {
      const updated = await api.users.setActive(id, active);
      setUser(updated);
      toast.success(active ? "Usuario activado" : "Usuario desactivado");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error cambiando estado");
    }
  }

  if (!user) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/users")}
      >
        ← Volver
      </Button>
      <h1 className="text-2xl font-semibold">{user.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-fit">
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permisos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label>Rol</Label>
            {isSelf ? (
              <span className="text-sm text-muted-foreground">
                {user.role} (no podés cambiar tu propio rol)
              </span>
            ) : (
              <Select value={user.role} onValueChange={(v) => handleRoleChange(v as Role)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label>Cuenta activa</Label>
            {isSelf ? (
              <span className="text-sm text-muted-foreground">
                No podés desactivar tu propia cuenta
              </span>
            ) : user.active ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Switch checked={user.active} />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Desactivar a {user.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      No va a poder iniciar sesión hasta que lo reactives.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleActiveChange(false)}>
                      Desactivar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Switch checked={user.active} onCheckedChange={handleActiveChange} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
