import { memo } from "react";

import type { Message } from "../../lib/chat";

interface UserMessageProps {
  message: Message;
}

/** 유저 질문: 오른쪽 말풍선 */
export const UserMessage = memo(UserMessageView);

function UserMessageView({ message }: UserMessageProps) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-200 px-4 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap dark:bg-zinc-800">
        <span className="sr-only">질문: </span>
        {message.content}
      </div>
    </div>
  );
}
