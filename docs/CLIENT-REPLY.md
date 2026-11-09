Hi Nathalie,

I’ve completed the practical validation, including the explicit PostgreSQL RLS policies and a Next.js server-side route that verifies the authenticated user, checks chapter access through RLS, and generates private Storage URLs with an expiry of exactly 120 seconds.

- SQL + standalone server code: https://gist.github.com/roshankoitechs/89bb88f102463f6aabd2907e718f82d3
- Working demo: https://brivel-reader-validation.vercel.app

Click **Open private chapter** and use `reader@brivel.test` / `Brivel-Demo-2026!`. To verify denial without a purchase, use `visitor@brivel.test` with the same demo password. These are disposable demo accounts with sample artwork.

Both the database query and the Storage signing request use the reader’s verified identity. The reading pipeline does not use a service-role key. A user cannot create their own purchase record or obtain access to another chapter by changing a path.

I also included a small responsive reader and reproducible tests covering authorized and unauthorized access, pending/refunded/revoked purchases, direct Storage requests, and actual URL expiry. I checked the deployed reader in Chrome on desktop and mobile widths and verified that the hosted private URLs really stop working after expiry.

One clarification: expiring URLs limit unauthorized access and link sharing, but cannot prevent an authorized reader from saving an image already delivered to their browser. The implementation and notes describe that boundary explicitly.

The Gist contains the SQL and standalone JavaScript route in the requested Markdown format. I’d be happy to walk through the solution in a 30-minute interview. Please let me know which time and timezone work for you.

Best regards,
Roshan
