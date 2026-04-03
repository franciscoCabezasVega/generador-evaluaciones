import { useSearchParams } from 'next/navigation';

interface FilterState {
  month: number;
  year: number;
  productType: string;
  squad: string;
  status: string;
}

export function useFilterParams(defaultFilters: FilterState) {
  const searchParams = useSearchParams();

  const getFiltersFromUrl = (): FilterState => {
    return {
      month: parseInt(searchParams.get('month') || defaultFilters.month.toString()),
      year: parseInt(searchParams.get('year') || defaultFilters.year.toString()),
      productType: searchParams.get('productType') || defaultFilters.productType,
      squad: searchParams.get('squad') || defaultFilters.squad,
      status: searchParams.get('status') || defaultFilters.status,
    };
  };

  const buildUrlParams = (filters: Partial<FilterState>): string => {
    const params = new URLSearchParams();
    if (filters.month) params.set('month', filters.month.toString());
    if (filters.year) params.set('year', filters.year.toString());
    if (filters.productType) params.set('productType', filters.productType);
    if (filters.squad) params.set('squad', filters.squad);
    if (filters.status) params.set('status', filters.status);
    return params.toString();
  };

  return {
    getFiltersFromUrl,
    buildUrlParams,
  };
}
