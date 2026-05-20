// ============================================================
// lib/supabase.js — clientes Supabase + helpers de seguridad
// Reutiliza el proyecto Supabase "AJAX Sistema de Gestión".
// El backend usa SOLO tablas con prefijo ppweb_.
// ============================================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
  console.warn('[supabase] Faltan variables SUPABASE_* en el entorno. El panel /admin no va a funcionar.');
}

// Cliente con service_role: bypassa RLS. USO EXCLUSIVO DEL BACKEND.
const supabaseAdmin = createClient(SUPABASE_URL || '', SERVICE_ROLE || '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Verifica un access token de usuario (Supabase Auth) y devuelve el user, o null.
async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (e) {
    return null;
  }
}

// ¿El user_id está en la lista blanca de administradores del panel?
async function isAdmin(userId) {
  if (!userId) return false;
  const { data, error } = await supabaseAdmin
    .from('ppweb_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !error && !!data;
}

// Middleware Express: exige sesión válida + estar en ppweb_admins.
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  if (!(await isAdmin(user.id))) return res.status(403).json({ error: 'No autorizado.' });
  req.adminUser = user;
  next();
}

module.exports = {
  supabaseAdmin,
  getUserFromToken,
  isAdmin,
  requireAdmin,
  SUPABASE_URL,
  ANON_KEY,
};
