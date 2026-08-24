"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Image as ImageIcon, ShoppingCart, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";

interface Counts {
  products: number;
  banners: number;
  orders: number;
  users: number;
}

export default function OverviewPage() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    Promise.all([
      api.products.list(1, 1),
      api.banners.list(1, 1),
      api.orders.list(1, 1),
      api.users.list(1, 1),
    ]).then(([products, banners, orders, users]) => {
      setCounts({
        products: products.total,
        banners: banners.total,
        orders: orders.total,
        users: users.total,
      });
    });
  }, []);

  const cards = [
    { label: "Productos", value: counts?.products, href: "/products", icon: Package },
    { label: "Banners", value: counts?.banners, href: "/banners", icon: ImageIcon },
    { label: "Pedidos", value: counts?.orders, href: "/orders", icon: ShoppingCart },
    { label: "Usuarios", value: counts?.users, href: "/users", icon: Users },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Resumen</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="transition-colors hover:bg-secondary/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <card.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {card.value ?? "…"}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
