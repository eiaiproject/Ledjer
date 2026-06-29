import { useState, useCallback } from "react";

/* ── Filter Preset ────────────────────────────────────── */

export interface FilterPreset {
  id: string;
  name: string;
  typeFilter: string;
  statusFilter: string;
  fromDate: string;
  toDate: string;
}

const STORAGE_KEY = "ledjer:transaction-filter-presets";
const MAX_PRESETS = 5;

function loadPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePresetsToStorage(presets: FilterPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing saved filter presets in localStorage.
 * Supports save, apply, and delete operations.
 */
export function useFilterPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>(loadPresets);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const save = useCallback(
    (filters: Omit<FilterPreset, "id" | "name">) => {
      if (!name.trim() || presets.length >= MAX_PRESETS) return false;
      const preset: FilterPreset = {
        id: Date.now().toString(36),
        name: name.trim(),
        ...filters,
      };
      const next = [...presets, preset];
      setPresets(next);
      savePresetsToStorage(next);
      setName("");
      setSaving(false);
      return true;
    },
    [name, presets]
  );

  const remove = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      savePresetsToStorage(next);
    },
    [presets]
  );

  return {
    presets,
    saving,
    setSaving,
    name,
    setName,
    save,
    remove,
    canSave: presets.length < MAX_PRESETS,
  };
}