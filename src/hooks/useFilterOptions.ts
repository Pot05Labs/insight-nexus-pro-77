import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";

export interface FilterOptions {
  brands: string[];
  retailers: string[];
  provinces: string[];
  categories: string[];
  platforms: string[];
  date_min: string | null;
  date_max: string | null;
}

const EMPTY: FilterOptions = {
  brands: [],
  retailers: [],
  provinces: [],
  categories: [],
  platforms: [],
  date_min: null,
  date_max: null,
};

export function useFilterOptions() {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["filter-options", projectId],
    queryFn: async (): Promise<FilterOptions> => {
      const { data, error } = await supabase.rpc("get_filter_options", {
        p_project_id: projectId!,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return EMPTY;

      const r = row as Record<string, unknown>;
      return {
        brands: (r.brands as string[]) ?? [],
        retailers: (r.retailers as string[]) ?? [],
        provinces: (r.provinces as string[]) ?? [],
        categories: (r.categories as string[]) ?? [],
        platforms: (r.platforms as string[]) ?? [],
        date_min: (r.date_min as string) ?? null,
        date_max: (r.date_max as string) ?? null,
      };
    },
    enabled: !!projectId,
    staleTime: 30_000, // Filter options change less frequently
    refetchOnWindowFocus: false,
  });
}
