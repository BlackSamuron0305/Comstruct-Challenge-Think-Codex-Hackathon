export type SupplierChannel = "API/PunchOut" | "Excel/PDF upload";

export type LocalSupplierDraft = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  contact_name?: string;
  channel: SupplierChannel;
};

const STORAGE_KEY = "comstruct-local-suppliers";

export function loadLocalSuppliers(): LocalSupplierDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalSupplierDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalSuppliers(suppliers: LocalSupplierDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers));
}

export function createLocalSupplierDraft(input: {
  name: string;
  email?: string;
  phone?: string;
  contact_name?: string;
  channel: SupplierChannel;
}): LocalSupplierDraft {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}`,
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    contact_name: input.contact_name?.trim() || undefined,
    channel: input.channel,
  };
}
