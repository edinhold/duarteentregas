import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: any[] = [];

  const accounts = [
    { email: "lojista@teste.com", password: "teste123456", name: "Lojista Teste", role: "store_owner", phone: "11999990001" },
    { email: "entregador@teste.com", password: "teste123456", name: "Entregador Teste", role: "driver", phone: "11999990002" },
    { email: "cliente@teste.com", password: "teste123456", name: "Cliente Teste", role: "user", phone: "11999990003" },
  ];

  for (const acc of accounts) {
    try {
      // Create user
      const { data: userData, error: userError } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { full_name: acc.name },
      });

      if (userError) {
        results.push({ email: acc.email, error: userError.message });
        continue;
      }

      const userId = userData.user.id;

      // Update profile phone
      await supabase.from("profiles").update({ phone: acc.phone }).eq("user_id", userId);

      // Assign role
      await supabase.from("user_roles").insert({ user_id: userId, role: acc.role });

      // If driver, create driver record
      if (acc.role === "driver") {
        await supabase.from("drivers").insert({
          user_id: userId,
          full_name: acc.name,
          phone: acc.phone,
          vehicle_type: "moto",
          is_active: true,
        });
      }

      // If store owner, create restaurant
      if (acc.role === "store_owner") {
        await supabase.from("restaurants").insert({
          name: "Loja Teste",
          address: "Rua Teste, 123",
          category_name: "Geral",
          owner_id: userId,
        });
      }

      results.push({ email: acc.email, userId, role: acc.role, success: true });
    } catch (e: any) {
      results.push({ email: acc.email, error: e.message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
