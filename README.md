Pak Spotlight — Admin Login Build

1. Upload the contents of this ZIP to the GitHub repository.
2. In Supabase, create your private Admin user under Authentication > Users. Use an email and strong password.
3. Disable public sign-ups in Supabase Authentication settings. Only manually created users should be able to sign in.
4. In Supabase SQL Editor, run the SQL below (adjust policy names if you already have policies with the same names):

ALTER TABLE public."Drama" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON TABLE public."Drama" FROM anon;
GRANT SELECT ON TABLE public."Drama" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Drama" TO authenticated;

CREATE POLICY "Drama public read" ON public."Drama"
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Drama admin insert" ON public."Drama"
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Drama admin update" ON public."Drama"
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Drama admin delete" ON public."Drama"
FOR DELETE TO authenticated USING (true);

5. If Supabase reports that a policy already exists, do not delete your data. Rename the new policy names or keep your existing SELECT policy and add only the authenticated INSERT/UPDATE/DELETE policies.
6. Public visitors can still read the Drama archive, but they cannot insert, edit, or delete rows.
7. The website Admin button opens a login screen for visitors who are not signed in. After login, Admin tools are available. LOG OUT returns to the public site.

Important: The browser-side login is only the UI gate. The Supabase Row Level Security and anon write revocation above are the actual database protection.
