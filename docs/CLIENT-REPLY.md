Hi Nathalie,

I’ve completed the practical validation. The attached code includes the explicit PostgreSQL RLS policies and a Next.js server-side route that verifies the authenticated user, checks chapter access through RLS, and generates private Storage URLs with an expiry of exactly 120 seconds.

Both the database query and the Storage signing request use the reader’s verified identity. The reading pipeline does not use a service-role key. A user cannot create their own purchase record or obtain access to another chapter by changing a path.

I also included a small responsive reader and reproducible tests covering authorized and unauthorized access, pending/refunded/revoked purchases, direct Storage requests, and actual URL expiry.

One clarification: expiring URLs limit unauthorized access and link sharing, but cannot prevent an authorized reader from saving an image already delivered to their browser. The implementation and notes describe that boundary explicitly.

The SQL and server code are provided below in the requested Markdown format. I’d be happy to walk through the solution in a 30-minute interview. Please let me know which time and timezone work for you.

Best regards,
Roshan
