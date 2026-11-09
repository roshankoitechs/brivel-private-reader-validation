import { validPublicConfig } from '@/lib/public-config';
import { Reader } from '@/components/reader';
export default function Home() {
  return (
    <Reader
      configured={validPublicConfig(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      )}
    />
  );
}
