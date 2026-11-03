import { createContext } from "react";

/** 메시지 id 별로 어디까지 흘려 보여 줬는지 기억하는 곳 */
export interface TypewriterMemory {
  recall: (id: string) => number | undefined;
  remember: (id: string, shown: number) => void;
  /** 끝난 메시지를 잊는다 */
  forget: (id: string) => void;
}

/** 빈 기억 저장소를 만든다 */
export function createTypewriterMemory(): TypewriterMemory {
  const shownById = new Map<string, number>();
  return {
    recall: (id) => shownById.get(id),
    remember: (id, shown) => {
      shownById.set(id, shown);
    },
    forget: (id) => {
      shownById.delete(id);
    },
  };
}

/** TypewriterMemoryProvider 가 채운다. 없으면(Provider 밖) 기억하지 않는다 */
export const TypewriterMemoryContext = createContext<TypewriterMemory | undefined>(undefined);
