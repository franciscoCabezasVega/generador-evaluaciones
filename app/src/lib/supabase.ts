import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or anon key');
}

/**
 * Cliente de Supabase singleton con sesión persistida en localStorage
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/**
 * Middleware helper para actualizar la sesión de Supabase
 * Necessary for server-side auth to work properly
 */
export async function updateSession(request: NextRequest) {
  try {
    // Create an unmodified response
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // Refresh the auth token if it exists
    const token = request.cookies.get('sb-' + supabaseUrl?.split('//')[1]?.split('.')[0] + '-auth-token');
    
    if (token) {
      response.headers.set('x-supabase-auth', token.value);
    }

    return response;
  } catch (error) {
    // If you are here, a Supabase client could not be created!
    // Most likely your edge function is not configured with auth secrets
    // or you are trying to create a client in a context that doesn't allow it
    console.error('Auth middleware error:', error);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}
