import { vi } from "vitest";

process.env.SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.API_FOOTBALL_KEY ??= "";
process.env.ODDS_API_KEY ??= "";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: { from: vi.fn(() => ({ remove: vi.fn(), createSignedUrl: vi.fn() })) },
    auth: { admin: { getUserById: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn() } },
  },
}));
