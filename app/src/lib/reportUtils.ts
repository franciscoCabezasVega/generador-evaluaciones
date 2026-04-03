import { SQUADS_BY_TYPE, ProductType } from '@/lib/types';

/**
 * Determina el producto (Core, Platform, Commerce) basándose en el nombre del squad/equipo
 * Esta es la forma más confiable de obtener el producto desde la información del reporte
 * @param squadName - Nombre del squad/equipo del reporte
 * @returns El producto: 'Core', 'Platform' o 'Commerce'
 */
export const getProductTypeFromSquad = (squadName: string): ProductType => {
  // Buscar en SQUADS_BY_TYPE para encontrar cuál productType contiene este squad
  for (const [productType, squads] of Object.entries(SQUADS_BY_TYPE)) {
    if (squads.includes(squadName)) {
      return productType as ProductType;
    }
  }

  // Fallback por si el squad no está en el mapeo (no debería ocurrir en producción)
  return 'Platform';
};
