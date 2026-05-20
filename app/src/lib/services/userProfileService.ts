import { supabase } from "@/lib/supabase";
import { getCurrentUserViaManager } from "@/lib/fetchAuth";
import { UserProfile, UserRole } from "@/lib/types";
import { getRoleNameById } from "@/lib/cache/rolesCache";

export const userProfileService = {
  // Obtener perfil del usuario autenticado
  async getUserProfile(): Promise<UserProfile | null> {
    try {
      const {
        data: { user },
        error: authError,
      } = await getCurrentUserViaManager();

      if (authError || !user) {
        return null;
      }

      // Query simple sin JOIN para evitar problemas RLS
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user profile from user_profiles:", error);
        return null;
      }

      if (!data) {
        return null;
      }

      // Obtener nombre del rol desde CACHE en memoria (evita queries repetidas)
      const roleName = await getRoleNameById(data.role_id, supabase);

      const profile: UserProfile = {
        id: data.id,
        email: data.email,
        name: data.name ?? null,
        lastname: data.lastname ?? null,
        role: roleName as UserRole,
        role_id: data.role_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        theme_preference:
          (data.theme_preference as UserProfile["theme_preference"]) ?? null,
      };

      return profile;
    } catch (error) {
      console.error("Exception in getUserProfile:", error);
      return null;
    }
  },

  // Verificar si usuario tiene un rol específico
  async hasRole(role: UserRole): Promise<boolean> {
    const profile = await this.getUserProfile();
    return profile?.role === role;
  },

  // Verificar si usuario tiene uno de varios roles
  async hasAnyRole(roles: UserRole[]): Promise<boolean> {
    const profile = await this.getUserProfile();
    if (!profile) return false;
    return roles.includes(profile.role);
  },

  // Obtener todos los usuarios (solo para admin)
  async getAllUsers() {
    try {
      const {
        data: { user },
        error: authError,
      } = await getCurrentUserViaManager();

      if (authError || !user) throw new Error("Not authenticated");

      // Verificar que sea admin
      const { data: adminCheck, error: adminError } = await supabase
        .from("user_profiles")
        .select("role_id")
        .eq("id", user.id)
        .single();

      if (adminError || adminCheck?.role_id !== 1) {
        throw new Error("Not authorized - admin only");
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, email, role_id")
        .returns<Record<string, unknown>[]>();

      if (error) throw error;

      // Obtener los roles del cache (evita queries repetidas)
      const rolesMap = await (async () => {
        const map = new Map<number, string>();
        for (const item of data) {
          const roleName = await getRoleNameById(
            item.role_id as number,
            supabase,
          );
          map.set(item.role_id as number, roleName);
        }
        return map;
      })();

      return data.map((item) => ({
        id: item.id as string,
        email: item.email as string,
        role: rolesMap.get(item.role_id as number) || "invitado",
        role_id: item.role_id as number,
      }));
    } catch (error) {
      console.error("Error in getAllUsers:", error);
      throw error;
    }
  },

  // Actualizar preferencia de tema del usuario autenticado
  async updateThemePreference(
    value: "light" | "dark" | "system",
  ): Promise<void> {
    try {
      const {
        data: { user },
        error: authError,
      } = await getCurrentUserViaManager();

      if (authError || !user) return;

      const { error } = await supabase
        .from("user_profiles")
        .update({ theme_preference: value })
        .eq("id", user.id);

      if (error) {
        console.error("Error updating theme preference:", error);
      }
    } catch (err) {
      console.error("Exception in updateThemePreference:", err);
    }
  },
};
