import { useMemo, useState } from "react";
import { PublicClient } from "viem";
import { fetchDomainsInfo, DomainRow } from "../lib/rnsActions";
import { ToastKind } from "./useToasts";
import { getErrorMessage } from "../lib/errors";

type PushToast = (message: string, kind?: ToastKind) => void;

export function useDomainPortfolio(pushToast: PushToast) {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [isLoadingDomains, setIsLoadingDomains] = useState(false);

  const selected = useMemo(() => domains.filter((domain) => domain.selected), [domains]);

  async function loadDomains(publicClient: PublicClient, labels: string[]) {
    setIsLoadingDomains(true);
    pushToast("Loading domain data...");

    try {
      const rows = await fetchDomainsInfo(publicClient, labels);
      setDomains(rows);
      pushToast("Domains loaded.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error, "Failed to fetch domain data."), "error");
      throw error;
    } finally {
      setIsLoadingDomains(false);
    }
  }

  async function refreshDomains(publicClient: PublicClient) {
    if (!domains.length) return;

    try {
      const rows = await fetchDomainsInfo(
        publicClient,
        domains.map((domain) => domain.label)
      );
      setDomains(rows);
    } catch (error) {
      pushToast(getErrorMessage(error, "Failed to refresh domains."), "error");
    }
  }

  function toggleSelect(index: number) {
    setDomains((current) =>
      current.map((domain, itemIndex) =>
        itemIndex === index ? { ...domain, selected: !domain.selected } : domain
      )
    );
  }

  function toggleAll(selectedValue: boolean) {
    setDomains((current) => current.map((domain) => ({ ...domain, selected: selectedValue })));
  }

  return {
    domains,
    isLoadingDomains,
    refreshDomains,
    selected,
    setDomains,
    loadDomains,
    toggleAll,
    toggleSelect
  };
}
