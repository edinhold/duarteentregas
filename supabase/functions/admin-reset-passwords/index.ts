import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão de administrador" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-verify admin password for identity confirmation
    const { admin_password } = await req.json();
    if (admin_password) {
      const { error: signInError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!)
        .auth.signInWithPassword({ email: caller.email!, password: admin_password });
      if (signInError) {
        return new Response(JSON.stringify({ error: "Senha do administrador incorreta. Confirme sua identidade." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // List all users
    const allUsers: any[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw error;
      if (!users || users.length === 0) break;
      allUsers.push(...users);
      if (users.length < perPage) break;
      page++;
    }

    // Filter out the caller admin
    const targetUsers = allUsers.filter((u) => u.id !== caller.id);

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Send recovery email to each user
    for (const user of targetUsers) {
      if (!user.email) {
        failureCount++;
        continue;
      }
      try {
        // Generate recovery link (this sends the recovery email)
        const { error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: user.email,
        });
        if (linkError) {
          failureCount++;
          errors.push(`${user.email}: ${linkError.message}`);
        } else {
          successCount++;
        }
      } catch (e: any) {
        failureCount++;
        errors.push(`${user.email}: ${e.message}`);
      }
    }

    // Log the action for audit
    await adminClient.from("password_reset_logs").insert({
      admin_user_id: caller.id,
      action: "bulk_reset",
      total_users: targetUsers.length,
      success_count: successCount,
      failure_count: failureCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        total: targetUsers.length,
        success_count: successCount,
        failure_count: failureCount,
        errors: errors.slice(0, 10), // limit error details
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
