import type { DefaultSession } from 'next-auth';
// Side-effect import required for the module augmentation below to be picked up.
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      role?: string;
      status?: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
    passwordVersion?: number;
    status?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string | null;
    /** Incremented on password change to invalidate stale JWT sessions (Task 1.4). */
    passwordVersion?: number;
    /** User.status — embedded so edge middleware can route DELETION_PENDING users (Task 6.1). */
    status?: string;
  }
}
