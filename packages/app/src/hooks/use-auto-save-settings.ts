import React, { useEffect, useState, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";

interface UseAutoSaveSettingsOptions<T> {
  settings: T | undefined;
  onSave: (settings: Partial<T>) => void;
  debounceMs?: number;
}

// Server-managed fields that should be excluded from change detection and save operations
const SERVER_MANAGED_FIELDS = new Set(["updatedAt", "createdAt", "userId"]);

/**
 * Filters out server-managed fields from an object
 */
function excludeServerManagedFields<T extends Record<string, unknown>>(
  obj: T
): Partial<T> {
  const filtered: Partial<T> = {};
  Object.keys(obj).forEach((key) => {
    if (!SERVER_MANAGED_FIELDS.has(key)) {
      filtered[key as keyof T] = obj[key];
    }
  });
  return filtered;
}

export function useAutoSaveSettings<T extends Record<string, unknown>>({
  settings,
  onSave,
  debounceMs = 500,
}: UseAutoSaveSettingsOptions<T>) {
  const [formData, setFormData] = useState<T | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const lastSavedSnapshotRef = useRef<string | null>(null);

  // Load settings into form when they're fetched
  // Use a ref to track if we've initialized to avoid setState in effect
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (settings && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      // Compare only user-editable fields (exclude server-managed fields)
      const userEditableSettings = excludeServerManagedFields(settings);
      const settingsSnapshot = JSON.stringify(userEditableSettings);

      // Only update formData if settings actually changed
      // This prevents updating formData when settings updates from our own save
      if (lastSavedSnapshotRef.current !== settingsSnapshot) {
        // Use startTransition to avoid cascading renders
        React.startTransition(() => {
          setFormData(settings);
        });
        // Update the snapshot to match what we just loaded (user-editable fields only)
        lastSavedSnapshotRef.current = settingsSnapshot;
      }
    }
  }, [settings]);

  // Mark initial load as complete after a short delay
  useEffect(() => {
    if (settings) {
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [settings]);

  // Debounce form data changes
  const debouncedFormData = useDebounce(formData, debounceMs);

  // Auto-save when debounced form data changes
  // Only depend on debouncedFormData to avoid multiple saves
  useEffect(() => {
    if (!settings || !debouncedFormData || isInitialLoad) return;

    // Filter out server-managed fields for comparison
    const userEditableFormData = excludeServerManagedFields(debouncedFormData);
    const userEditableSettings = excludeServerManagedFields(settings);

    // Check if any user-editable value actually changed from the loaded settings
    const hasChanges = Object.keys(userEditableFormData).some(
      (key) => userEditableFormData[key] !== userEditableSettings[key]
    );

    if (hasChanges) {
      // Create a partial update object with only changed user-editable values
      const updates: Partial<T> = {};
      Object.keys(userEditableFormData).forEach((key) => {
        if (userEditableFormData[key] !== userEditableSettings[key]) {
          updates[key as keyof T] = userEditableFormData[key];
        }
      });

      // Only save if there are actual updates (should always be true here, but double-check)
      if (Object.keys(updates).length > 0) {
        // Create snapshot of the user-editable formData we're about to save
        // This prevents saving the same data twice if the effect runs multiple times
        const formDataSnapshot = JSON.stringify(userEditableFormData);

        // Only save if this is different from what we last saved
        if (lastSavedSnapshotRef.current !== formDataSnapshot) {
          lastSavedSnapshotRef.current = formDataSnapshot;
          onSave(updates);
        }
      }
    }
  }, [debouncedFormData, settings, isInitialLoad, onSave]);

  return {
    formData,
    setFormData,
    isInitialLoad,
  };
}
