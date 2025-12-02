import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@tuvixrss/api";
import type { inferRouterOutputs } from "@trpc/server";

export const trpc = createTRPCReact<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;
