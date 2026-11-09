# Brivel validation delivery

## Send to Nathalie

- Working reader: https://brivel-reader-validation.vercel.app
- SQL and standalone Next.js server code: https://gist.github.com/roshankoitechs/89bb88f102463f6aabd2907e718f82d3
- Raw Markdown alternative: https://gist.githubusercontent.com/roshankoitechs/89bb88f102463f6aabd2907e718f82d3/raw/SUBMISSION.md

Open **Open private chapter**. Purchased reader: `reader@brivel.test` / `Brivel-Demo-2026!`. No-purchase case: `visitor@brivel.test` / `Brivel-Demo-2026!`.

The Gist is secret/unlisted, not access-controlled. Anyone with the link can read it. It contains code and explanation, with no credentials. The demo credentials above belong only to disposable synthetic fixtures. The private high-resolution fixtures use the same original sample illustrations as the public preview.

The ready-to-send English note is in [`CLIENT-REPLY.md`](CLIENT-REPLY.md). Nothing has been sent to the client.

## Roshan's management links

- Private repository: https://github.com/roshankoitechs/brivel-private-reader-validation
- CI: https://github.com/roshankoitechs/brivel-private-reader-validation/actions
- Vercel project: https://vercel.com/roshankoitechs-8620s-projects/brivel-reader-validation
- Supabase project: https://supabase.com/dashboard/project/jvmqcshybsetnwafbtqw

These management pages require the respective account permissions and are not client demo links. Vercel and Supabase were opened as `roshan.koitechs@gmail.com`; GitHub owner is `roshankoitechs`.

Vercel contains only three public application settings: Supabase URL, publishable key and target chapter UUID. The temporary deployment token was scoped only to this Vercel project with a one-hour expiry. The administrative Supabase key used to seed fixtures was never deployed or committed.

## Verification

58 automated checks and 23 local Supabase HTTP checks passed. Nine additional hosted HTTPS checks passed, including original PNG bytes, exact 120-second token lifetime, real expiry rejection and denial without a purchase. Production browser checks covered login errors/success, all private images, navigation, return to preview and mobile widths of 390px and 320px. Details: [`VERIFICATION.md`](VERIFICATION.md).

The demo is for this practical validation. Signed URLs limit access and link sharing; an authorized reader can still save image bytes already received. No payment platform or DRM guarantee is claimed.
