import { useEffect, useState } from "react";
import {
  cloneExtendedProfile,
  DEFAULT_EXTENDED_TEST_PROFILE,
  sanitizeExtendedProfile,
  type ExtendedTestProfile,
} from "../lib/extendedTestProfiles";

const STORAGE_KEY = "neq6-extended-test-profiles-v1";

interface StoredProfiles {
  profiles: ExtendedTestProfile[];
  selectedId: string;
}

function loadProfiles(): StoredProfiles {
  const fallback = cloneExtendedProfile(DEFAULT_EXTENDED_TEST_PROFILE);
  if (typeof localStorage === "undefined") return { profiles: [fallback], selectedId: fallback.id };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StoredProfiles> | null;
    const profiles = Array.isArray(parsed?.profiles)
      ? parsed.profiles.map(sanitizeExtendedProfile).filter((profile): profile is ExtendedTestProfile => profile !== null)
      : [];
    if (!profiles.length) return { profiles: [fallback], selectedId: fallback.id };
    return {
      profiles,
      selectedId: profiles.some((profile) => profile.id === parsed?.selectedId) ? parsed!.selectedId! : profiles[0].id,
    };
  } catch {
    return { profiles: [fallback], selectedId: fallback.id };
  }
}

export function useExtendedTestProfiles() {
  const [stored, setStored] = useState<StoredProfiles>(loadProfiles);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [stored]);
  const setProfiles = (profiles: ExtendedTestProfile[]) => setStored((current) => {
    const selectedId = profiles.some((profile) => profile.id === current.selectedId)
      ? current.selectedId
      : profiles[0]?.id ?? "";
    return { profiles, selectedId };
  });
  const setSelectedId = (selectedId: string) => setStored((current) =>
    current.profiles.some((profile) => profile.id === selectedId) ? { ...current, selectedId } : current);
  return { profiles: stored.profiles, selectedId: stored.selectedId, setProfiles, setSelectedId };
}
