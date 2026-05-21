import type { DefaultSession } from 'next-auth';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string | null;
    /** Set to true when a server-side status revalidation finds the user inactive. */
    deactivated?: boolean;
    /** Unix ms timestamp of the last server-side user status check. */
    statusCheckedAt?: number;
  }
}
