import type { ReactNode } from "react";

import { RoomsProvider } from "./rooms-context";

export default function RoomsLayout({ children }: { children: ReactNode }) {
  return <RoomsProvider>{children}</RoomsProvider>;
}
