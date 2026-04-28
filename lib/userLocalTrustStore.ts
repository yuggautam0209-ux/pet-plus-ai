/**
 * Owner-entered contacts and notes — stored only in the browser (localStorage).
 * No network calls; no secrets in repo.
 */
export type UserLocalTrustStore = {
  version: 1;
  primaryVetPhone: string;
  backupVetPhone: string;
  emergencyAnimalHotline: string;
  feedNotes: string;
  vaultNotes: string;
};

const STORAGE_KEY = "petpulse.userLocalTrust.v1";

export function defaultUserLocalTrust(): UserLocalTrustStore {
  return {
    version: 1,
    primaryVetPhone: "",
    backupVetPhone: "",
    emergencyAnimalHotline: "",
    feedNotes: "",
    vaultNotes: "",
  };
}

export function loadUserLocalTrust(): UserLocalTrustStore {
  if (typeof window === "undefined") return defaultUserLocalTrust();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUserLocalTrust();
    const parsed = JSON.parse(raw) as Partial<UserLocalTrustStore>;
    return { ...defaultUserLocalTrust(), ...parsed, version: 1 };
  } catch {
    return defaultUserLocalTrust();
  }
}

export function saveUserLocalTrust(next: UserLocalTrustStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, version: 1 }));
}

export function splitUserNotes(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}
