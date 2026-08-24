"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ImageUrlField({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="url"
        required={required}
        value={value}
        onChange={(e) => {
          setBroken(false);
          onChange(e.target.value);
        }}
        placeholder="https://…"
      />
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview de URL arbitraria, sin optimizar
          <img
            src={value}
            alt="Preview"
            width={96}
            height={96}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <ImageOff aria-hidden="true" className="size-6 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
