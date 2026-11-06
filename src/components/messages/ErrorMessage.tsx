import type { AnswerError } from "../../lib/chat";
import { errorGuide } from "../../lib/labels";

interface ErrorMessageProps {
  error: AnswerError;
  onRetry?: () => void;
  isRetryDisabled?: boolean;
}

/**
 * 오류 안내: 코드별 사용자용 문장 + 다시 시도 (다시 보내도 같은 결과인 오류는 버튼 없음).
 * 계약상 error_code 는 로그용이라 코드 · 서버 원문은 보이지 않는다 (useChat 이 로그에 남긴다).
 */
export function ErrorMessage({ error, onRetry, isRetryDisabled = false }: ErrorMessageProps) {
  const guide = errorGuide(error.code);

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      <p className="min-w-0 flex-1 font-medium">{guide.text}</p>
      {onRetry && guide.canRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetryDisabled}
          className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-900/50"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
