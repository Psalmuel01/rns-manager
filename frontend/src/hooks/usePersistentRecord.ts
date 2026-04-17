import { useEffect, useState } from "react";

export function usePersistentRecord<T extends Record<string, string>>(key: string | null) {
  const [value, setValue] = useState<T>({} as T);

  useEffect(() => {
    if (!key) {
      setValue({} as T);
      return;
    }

    try {
      const stored = localStorage.getItem(key);
      setValue(stored ? (JSON.parse(stored) as T) : ({} as T));
    } catch {
      setValue({} as T);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
