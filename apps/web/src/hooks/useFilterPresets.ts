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

interface UseFilterPresetsOptions {
  storageKey?: string;
  maxPresets?: number;
}

const DEFAULT_STORAGE_KEY = "ledjer:transaction-filter-presets";
const DEFAULT_MAX_PRESETS = 5;

function loadPresets(key: string): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function savePresetsToStorage(key: string, presets: FilterPreset[]) {
  try {
    localStorage.setItem(key, JSON.stringify(presets));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing saved filter presets in localStorage.
 * Supports save, apply, and delete operations.
 */
export function useFilterPresets(options: UseFilterPresetsOptions = {}) {
  const { storageKey = DEFAULT_STORAGE_KEY, maxPresets = DEFAULT_MAX_PRESETS } = options;
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets(storageKey));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const save = useCallback(
    (filters: Omit<FilterPreset, "id" | "name">) => {
      if (!name.trim() || presets.length >= maxPresets) return false;
      const preset: FilterPreset = {
        id: Date.now().toString(36),
        name: name.trim(),
        ...filters,
      };
      const next = [...presets, preset];
      setPresets(next);
      savePresetsToStorage(storageKey, next);
      setName("");
      setSaving(false);
      return true;
    },
    [name, presets, maxPresets, storageKey]
  );

  const remove = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      savePresetsToStorage(storageKey, next);
    },
    [presets, storageKey]
  );

  return {
    presets,
    saving,
    setSaving,
    name,
    setName,
    save,
    remove,
    canSave: presets.length < maxPresets,
  };
}
