import { redirect } from 'next/navigation';

// Redirect to the canonical public witness URL (outside locale routing).
// Handles any inbound links that may have included a locale prefix.
export default async function WitnessRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  redirect(`/witness/${token}`);
}
