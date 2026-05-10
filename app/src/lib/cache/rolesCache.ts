/**
 * Cacheo en memoria de los roles (datos que casi no cambian)
 * Evita queries repetidas a supabase.from('roles')
 * Se auto-invalida cada 24 horas
 */

interface RoleData {
  id: number;
  name: string;
}

interface SupabaseClientLike {
  from: (table: string) => {
    select: (
      columns: string,
    ) => PromiseLike<{ data: RoleData[] | null; error: unknown }>;
  };
}

let rolesCache: Map<number, string> | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
let isFetching = false;
let fetchPromise: Promise<Map<number, string>> | null = null;

/**
 * Obtener los roles cacheados
 * Si no existen o expiraron, hace fetch una sola vez
 */
export async function getRoles(
  supabaseClient: SupabaseClientLike,
): Promise<Map<number, string>> {
  const now = Date.now();

  // Si hay cache válido, devolverlo inmediatamente
  if (rolesCache && now - lastFetchTime < CACHE_DURATION) {
    return rolesCache;
  }

  // Si ya hay una petición en progreso, esperar a ella
  if (isFetching && fetchPromise) {
    return fetchPromise;
  }

  // Iniciar el fetch
  isFetching = true;
  fetchPromise = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from("roles")
        .select("id, name");

      if (error) {
        console.error("Error fetching roles:", error);
        // Devolver cache viejo si hay error
        return rolesCache || new Map();
      }

      // Construir el mapa de roles ID -> nombre
      const newRolesMap = new Map<number, string>();
      if (data && Array.isArray(data)) {
        data.forEach((role: RoleData) => {
          newRolesMap.set(role.id, role.name);
        });
      }

      rolesCache = newRolesMap;
      lastFetchTime = now;
      return rolesCache;
    } finally {
      isFetching = false;
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Invalidar el cache (por ejemplo si se actualiza un rol)
 */
export function invalidateRolesCache() {
  rolesCache = null;
  lastFetchTime = 0;
}

/**
 * Obtener el nombre de un rol por su ID desde el cache
 */
export async function getRoleNameById(
  roleId: number,
  supabaseClient: SupabaseClientLike,
): Promise<string> {
  const roles = await getRoles(supabaseClient);
  return roles.get(roleId) || "invitado";
}
