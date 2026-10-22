import { createContext } from "react";

/** 메시지 id → 어디까지 흘려 보여 줬는지. 없으면(Provider 밖) 기억하지 않는다 */
export type TypewriterMemory = Map<string, number>;

/** TypewriterMemoryProvider 가 채운다 */
export const TypewriterMemoryContext = createContext<TypewriterMemory | null>(null);
