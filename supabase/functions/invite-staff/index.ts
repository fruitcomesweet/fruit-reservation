import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const allowedRoles = ["owner", "manager", "order_staff"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function createTemporaryPassword() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);

  const randomPart = Array.from(bytes)
    .map((byte) => byte.toString(36))
    .join("");

  return `Fs1!${randomPart}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "只接受 POST 請求" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "伺服器環境設定不完整" }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "請先登入後台" }, 401);
    }

    const accessToken = authorization.replace("Bearer ", "");

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 確認目前呼叫者是真正登入的 Supabase 使用者
    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(accessToken);

    if (userError || !user) {
      return json({ error: "登入狀態無效，請重新登入" }, 401);
    }

    // 確認目前登入者是啟用中的老闆
    const { data: currentStaff, error: staffError } = await adminClient
      .from("staff_profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      staffError ||
      !currentStaff ||
      currentStaff.role !== "owner" ||
      currentStaff.is_active !== true
    ) {
      return json({ error: "只有老闆帳號可以新增員工" }, 403);
    }

    const body = await req.json();

    const displayName = String(body.display_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "order_staff");
    const isActive = body.is_active !== false;

    if (!displayName) {
      return json({ error: "請填寫員工姓名" }, 400);
    }

    if (!email || !email.includes("@")) {
      return json({ error: "請填寫正確的 Email" }, 400);
    }

    if (!allowedRoles.includes(role)) {
      return json({ error: "員工權限設定不正確" }, 400);
    }

    const temporaryPassword = createTemporaryPassword();

    // 建立 Supabase Authentication 登入帳號
    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
        },
      });

    if (createError || !createdUser.user) {
      const message = createError?.message || "員工帳號建立失敗";

      if (
        message.toLowerCase().includes("already") ||
        message.toLowerCase().includes("registered")
      ) {
        return json({ error: "此 Email 已經有登入帳號" }, 409);
      }

      return json({ error: message }, 400);
    }

    // 建立員工權限資料
    const { error: profileError } = await adminClient
      .from("staff_profiles")
      .insert({
        user_id: createdUser.user.id,
        email,
        display_name: displayName,
        role,
        is_active: isActive,
      });

    if (profileError) {
      // 員工資料建立失敗時，刪除剛建立的登入帳號，避免留下半套資料
      await adminClient.auth.admin.deleteUser(createdUser.user.id);

      return json(
        {
          error: `員工權限建立失敗：${profileError.message}`,
        },
        500,
      );
    }

    return json({
      success: true,
      message: "員工帳號建立成功",
      staff: {
        user_id: createdUser.user.id,
        display_name: displayName,
        email,
        role,
        is_active: isActive,
      },
      temporary_password: temporaryPassword,
    });
  } catch (error) {
    console.error(error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "建立員工時發生未知錯誤",
      },
      500,
    );
  }
});