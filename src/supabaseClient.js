import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// .env が未設定でも他の機能(絵を描く等)が壊れないよう、未設定時は null を返す
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
