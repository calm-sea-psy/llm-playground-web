import { useState, type ReactNode } from "react";

import { createTypewriterMemory, TypewriterMemoryContext } from "./typewriterMemoryContext";

interface TypewriterMemoryProviderProps {
  children: ReactNode;
}

/**
 * 타이핑 효과의 진행 위치를 앱 전체에서 기억한다.
 * 받는 도중 다른 대화로 갔다 돌아오면 메시지 컴포넌트가 새로 만들어지는데, 그때 처음부터 다시 흘리지 않게 한다.
 */
export function TypewriterMemoryProvider({ children }: TypewriterMemoryProviderProps) {
  // 앱이 살아 있는 동안 한 번만 만든다
  // eslint-disable-next-line react/hook-use-state -- setter 가 필요 없다
  const [memory] = useState(createTypewriterMemory);
  return <TypewriterMemoryContext value={memory}>{children}</TypewriterMemoryContext>;
}
