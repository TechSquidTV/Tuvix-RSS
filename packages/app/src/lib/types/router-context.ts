import type { Session } from "better-auth/types";

export interface RouterContext {
  auth: {
    session: Session | null;
  };
}
