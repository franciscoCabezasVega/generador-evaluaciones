import { ProductType } from '@/lib/types';

/**
 * Determina el producto basándose en el nombre del squad/equipo
 * Recibe el mapeo dinámico obtenido desde la base de datos
 * @param squadName - Nombre del squad/equipo del reporte
 * @param squadsByProduct - Mapeo { productName: string[] } obtenido desde Supabase
 * @returns El producto correspondiente o 'Platform' como fallback
 */
export const getProductTypeFromSquad = (
  squadName: string,
  squadsByProduct: Record<string, string[]>
): ProductType => {
  for (const [productType, squads] of Object.entries(squadsByProduct)) {
    if (squads.includes(squadName)) {
      return productType as ProductType;
    }
  }

  // Fallback por si el squad no está en el mapeo
  return 'Platform';
};
