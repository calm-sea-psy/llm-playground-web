import { OptionSelect } from "./OptionSelect";
import { ASK_MODES, type AskMode } from "../api/types";
import { ASK_MODE_NAMES } from "../lib/labels";

interface AskModeSelectProps {
  value: AskMode;
  onChange: (value: AskMode) => void;
  disabled?: boolean;
}

/** 답변 방식 선택 (단발 / 에이전트). 다음 질문부터 적용된다 */
export function AskModeSelect({ value, onChange, disabled = false }: AskModeSelectProps) {
  return (
    <OptionSelect
      value={value}
      options={ASK_MODES}
      labelOf={(mode) => ASK_MODE_NAMES[mode]}
      onChange={onChange}
      label="답변 방식"
      disabled={disabled}
    />
  );
}
