import { AuthShell } from './AuthShell';

/** Shown when .env.local has no Supabase settings, so the app explains itself instead of failing. */
export function SetupRequiredPage() {
  return (
    <AuthShell title="Connect Supabase" subtitle="The app needs your Supabase project settings before anyone can sign in.">
      <ol className="list-decimal space-y-2 pl-4 text-xs text-fg2">
        <li>
          Copy <code className="rounded bg-surface2 px-1 text-fg">.env.example</code> to{' '}
          <code className="rounded bg-surface2 px-1 text-fg">.env.local</code> in the project folder.
        </li>
        <li>
          Fill in the project URL and the publishable key from Supabase, under Project Settings, API Keys.
        </li>
        <li>
          Add DATABASE_URL and run <code className="rounded bg-surface2 px-1 text-fg">npm run db:migrate</code>.
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </AuthShell>
  );
}
